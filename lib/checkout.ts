import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import type { ApiCustomerContext } from "@/lib/api/auth";
import { badRequest, conflict, internalError, notFound } from "@/lib/api/errors";
import {
  checkoutRequestSchema,
  quoteCheckout,
  type CheckoutQuote,
  type CheckoutRequest,
} from "@/lib/commerce";
import { applicationUrl, createHitPayClient, type HitPayClient } from "@/lib/hitpay";

export interface CheckoutResult {
  mode: "order" | "preorder";
  orderId?: string;
  preorderId?: string;
  paymentId: string;
  paymentRequestId: string;
  checkoutUrl: string;
  publishableCurrency: string;
  amountCents: number;
  quote: CheckoutQuote;
  reservationExpiresAt?: string;
}

const cancelCheckoutSchema = z.object({
  paymentRequestId: z.string().uuid(),
});

export function checkoutResponseBody(result: CheckoutResult) {
  return {
    mode: result.mode,
    orderId: result.orderId,
    preorderId: result.preorderId,
    paymentId: result.paymentId,
    paymentRequestId: result.paymentRequestId,
    checkoutUrl: result.checkoutUrl,
    amountCents: result.amountCents,
    currency: result.publishableCurrency,
    quote: result.quote,
    reservationExpiresAt: result.reservationExpiresAt,
  };
}

export async function createCheckoutPayment(
  auth: ApiCustomerContext,
  body: unknown,
  hitpay: HitPayClient = createHitPayClient()
): Promise<CheckoutResult> {
  const request = checkoutRequestSchema.parse(body) as CheckoutRequest;
  const quote = await quoteCheckout(auth.supabase, request, auth.customer);

  if (quote.totalCents <= 0) throw badRequest("Checkout total must be greater than zero");
  if (quote.mode !== "preorder") {
    throw badRequest("Normal orders must use the shipping-aware checkout flow");
  }

  return createPreorderPayment(auth, quote, hitpay);
}

export async function cancelPendingCheckoutPayment(
  auth: ApiCustomerContext,
  body: unknown,
  hitpay: HitPayClient = createHitPayClient()
): Promise<{ cancelled: true; orderId?: string; preorderId?: string }> {
  const input = cancelCheckoutSchema.parse(body);
  const payment = await paymentByRequest(auth.supabase, input.paymentRequestId);
  if (!payment) throw notFound("Payment not found");

  if (!["pending", "requires_capture", "authorized"].includes(payment.status)) {
    throw conflict("Payment can no longer be cancelled");
  }

  if (payment.order_id) await assertCustomerOrderIsCancellable(auth, payment.order_id);
  if (payment.preorder_id) {
    await assertCustomerPreorderIsCancellable(auth, payment.preorder_id);
  }

  try {
    await hitpay.cancelPaymentRequest(input.paymentRequestId);
  } catch {
    // HitPay cannot always revoke a PayNow payment after QR generation. Local
    // cancellation releases the reservation; a late completion is refunded by
    // the signed webhook handler.
  }

  const paymentUpdate = await auth.supabase
    .from("payments")
    .update({ status: "cancelled" })
    .eq("id", payment.id)
    .in("status", ["pending", "requires_capture", "authorized"]);
  if (paymentUpdate.error) throw new Error(paymentUpdate.error.message);

  if (payment.order_id) {
    const release = await auth.supabase.rpc("release_order_allocation", {
      p_order_id: payment.order_id,
    });
    if (release.error) throw new Error(release.error.message);

    const orderUpdate = await auth.supabase
      .from("orders")
      .update({ status: "cancelled", checkout_reserved_until: null })
      .eq("id", payment.order_id)
      .in("status", ["draft", "pending_payment"]);
    if (orderUpdate.error) throw new Error(orderUpdate.error.message);
  }

  if (payment.preorder_id) {
    const preorderUpdate = await auth.supabase
      .from("preorders")
      .update({ status: "cancelled" })
      .eq("id", payment.preorder_id)
      .eq("status", "pending_payment");
    if (preorderUpdate.error) throw new Error(preorderUpdate.error.message);
  }

  return {
    cancelled: true,
    orderId: payment.order_id ?? undefined,
    preorderId: payment.preorder_id ?? undefined,
  };
}

async function createPreorderPayment(
  auth: ApiCustomerContext,
  quote: CheckoutQuote,
  hitpay: HitPayClient
): Promise<CheckoutResult> {
  const line = quote.lines[0];
  if (!line) throw badRequest("Pre-order checkout requires one line");

  let preorderId: string | null = null;
  let paymentRequestId: string | null = null;

  try {
    const preorder = await auth.supabase
      .from("preorders")
      .insert({
        customer_id: auth.customer.id,
        sku_id: line.skuId,
        channel: "b2c",
        quantity: line.quantity,
        unit_price_cents: line.unitPriceCents,
        deposit_cents: quote.totalCents,
        balance_cents: 0,
        currency: quote.currency,
        status: "pending_payment",
      })
      .select("id")
      .single();
    if (preorder.error || !preorder.data) {
      throw new Error(preorder.error?.message ?? "preorder insert failed");
    }

    preorderId = String(preorder.data.id);
    const request = await hitpay.createPaymentRequest({
      amountCents: quote.totalCents,
      currency: quote.currency,
      email: auth.customer.email,
      name: auth.customer.name,
      purpose: `Pre-order ${line.name}`,
      referenceNumber: `preorder:${preorderId}`,
      redirectUrl: applicationUrl("/orders?checkout=processing#preorders"),
      expiresAfter: "15 minutes",
    });
    paymentRequestId = request.id;

    const payment = await insertPayment(auth.supabase, {
      preorderId,
      providerPaymentId: request.id,
      amountCents: quote.totalCents,
      currency: quote.currency,
    });

    return {
      mode: "preorder",
      preorderId,
      paymentId: payment.id,
      paymentRequestId: request.id,
      checkoutUrl: request.url,
      publishableCurrency: quote.currency,
      amountCents: quote.totalCents,
      quote,
    };
  } catch (error) {
    await rollbackFailedPreorderCheckout(auth.supabase, {
      preorderId,
      paymentRequestId,
      hitpay,
    });
    throw error instanceof Error ? error : internalError();
  }
}

async function insertPayment(
  supabase: SupabaseClient,
  input: {
    preorderId: string;
    providerPaymentId: string;
    amountCents: number;
    currency: string;
  }
): Promise<{ id: string }> {
  const { data, error } = await supabase
    .from("payments")
    .insert({
      preorder_id: input.preorderId,
      provider: "hitpay",
      provider_payment_id: input.providerPaymentId,
      kind: "full",
      amount_cents: input.amountCents,
      currency: input.currency,
      status: "pending",
    })
    .select("id")
    .single();

  if (error || !data) throw new Error(error?.message ?? "payment insert failed");
  return { id: data.id };
}

async function paymentByRequest(supabase: SupabaseClient, paymentRequestId: string) {
  const { data, error } = await supabase
    .from("payments")
    .select("id, order_id, preorder_id, kind, status")
    .eq("provider", "hitpay")
    .eq("provider_payment_id", paymentRequestId)
    .maybeSingle();
  if (error) throw new Error(error.message);

  return data as {
    id: string;
    order_id: string | null;
    preorder_id: string | null;
    kind: "full";
    status: string;
  } | null;
}

async function assertCustomerOrderIsCancellable(
  auth: ApiCustomerContext,
  orderId: string
): Promise<void> {
  const { data, error } = await auth.supabase
    .from("orders")
    .select("id, status")
    .eq("id", orderId)
    .eq("customer_id", auth.customer.id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw notFound("Order not found");
  if (!["draft", "pending_payment"].includes(String(data.status))) {
    throw conflict("Order can no longer be cancelled");
  }
}

async function assertCustomerPreorderIsCancellable(
  auth: ApiCustomerContext,
  preorderId: string
): Promise<void> {
  const { data, error } = await auth.supabase
    .from("preorders")
    .select("id, status")
    .eq("id", preorderId)
    .eq("customer_id", auth.customer.id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw notFound("Pre-order not found");
  if (String(data.status) !== "pending_payment") {
    throw conflict("Pre-order payment can no longer be cancelled");
  }
}

async function rollbackFailedPreorderCheckout(
  supabase: SupabaseClient,
  input: {
    preorderId: string | null;
    paymentRequestId: string | null;
    hitpay: HitPayClient;
  }
): Promise<void> {
  if (input.paymentRequestId) {
    try {
      await input.hitpay.cancelPaymentRequest(input.paymentRequestId);
    } catch {
      // Local cancellation remains authoritative until any signed late webhook.
    }
  }
  if (input.preorderId) {
    await supabase.from("preorders").update({ status: "cancelled" }).eq("id", input.preorderId);
  }
}
