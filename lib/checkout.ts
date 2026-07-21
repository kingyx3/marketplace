import type { SupabaseClient } from "@supabase/supabase-js";

import { badRequest, conflict } from "@/lib/api/errors";
import type { ApiCustomerContext } from "@/lib/api/auth";
import type { CheckoutQuote } from "@/lib/commerce";
import { applicationUrl, type HitPayClient } from "@/lib/hitpay";

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

export async function cancelPendingCheckoutPayment(
  auth: ApiCustomerContext,
  input: { paymentRequestId: string },
  hitpay: HitPayClient
): Promise<{ cancelled: true; orderId?: string; preorderId?: string }> {
  const { data: payment, error } = await auth.supabase
    .from("payments")
    .select("id, order_id, preorder_id, status")
    .eq("provider", "hitpay")
    .eq("provider_payment_id", input.paymentRequestId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!payment) throw badRequest("Payment request not found");
  if (!["pending", "requires_capture", "authorized"].includes(payment.status)) {
    throw conflict("Payment request can no longer be cancelled");
  }

  try {
    await hitpay.cancelPaymentRequest(input.paymentRequestId);
  } catch {
    // PayNow requests may remain payable after the local reservation is released.
    // Any later successful payment is reconciled and refunded by the signed webhook handler.
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

export async function createPreorderPayment(
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
      purpose: `Pre-order ${line.productName}`,
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
    throw error;
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
      // Signed webhook reconciliation remains authoritative for late settlement.
    }
  }
  if (!input.preorderId) return;

  await supabase.from("payments").update({ status: "cancelled" }).eq("preorder_id", input.preorderId);
  await supabase
    .from("preorders")
    .update({ status: "cancelled" })
    .eq("id", input.preorderId)
    .eq("status", "pending_payment");
}
