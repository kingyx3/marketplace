import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";
import { z } from "zod";

import type { ApiCustomerContext } from "@/lib/api/auth";
import { badRequest, conflict, internalError, notFound } from "@/lib/api/errors";
import {
  checkoutRequestSchema,
  quoteCheckout,
  type CheckoutQuote,
  type CheckoutRequest,
} from "@/lib/commerce";
import { createStripeClient } from "@/lib/stripe";

export interface CheckoutResult {
  mode: "order" | "preorder";
  orderId?: string;
  preorderId?: string;
  paymentId: string;
  paymentIntentId: string;
  clientSecret: string;
  publishableCurrency: string;
  amountCents: number;
  quote: CheckoutQuote;
  reservationExpiresAt?: string;
}

const cancelCheckoutSchema = z.object({
  paymentIntentId: z.string().trim().min(3).max(200).startsWith("pi_"),
});

export function checkoutResponseBody(result: CheckoutResult) {
  return {
    mode: result.mode,
    orderId: result.orderId,
    preorderId: result.preorderId,
    paymentId: result.paymentId,
    paymentIntentId: result.paymentIntentId,
    clientSecret: result.clientSecret,
    amountCents: result.amountCents,
    currency: result.publishableCurrency,
    quote: result.quote,
    reservationExpiresAt: result.reservationExpiresAt,
  };
}

/**
 * This function remains the preorder entry point used by order-checkout.ts.
 * Preorders and normal orders now both require 100% payment at checkout.
 */
export async function createCheckoutPayment(
  auth: ApiCustomerContext,
  body: unknown,
  stripe: Stripe = createStripeClient()
): Promise<CheckoutResult> {
  const request = checkoutRequestSchema.parse(body) as CheckoutRequest;
  const quote = await quoteCheckout(auth.supabase, request, auth.customer);

  if (quote.totalCents <= 0) throw badRequest("Checkout total must be greater than zero");
  if (quote.mode !== "preorder") {
    throw badRequest("Normal orders must use the shipping-aware checkout flow");
  }

  return createPreorderPayment(auth, quote, stripe);
}

export async function cancelPendingCheckoutPayment(
  auth: ApiCustomerContext,
  body: unknown,
  stripe: Stripe = createStripeClient()
): Promise<{ cancelled: true; orderId?: string; preorderId?: string }> {
  const input = cancelCheckoutSchema.parse(body);
  const payment = await paymentByIntent(auth.supabase, input.paymentIntentId);
  if (!payment) throw notFound("Payment not found");

  if (!["pending", "requires_capture", "authorized"].includes(payment.status)) {
    throw conflict("Payment can no longer be cancelled");
  }

  if (payment.order_id) await assertCustomerOrderIsCancellable(auth, payment.order_id);
  if (payment.preorder_id) await assertCustomerPreorderIsCancellable(auth, payment.preorder_id);

  try {
    await stripe.paymentIntents.cancel(input.paymentIntentId);
  } catch {
    throw conflict("Payment can no longer be cancelled");
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
  stripe: Stripe
): Promise<CheckoutResult> {
  const line = quote.lines[0];
  if (!line) throw badRequest("Pre-order checkout requires one line");

  let preorderId: string | null = null;
  let paymentIntentId: string | null = null;

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
    const intent = await stripe.paymentIntents.create(
      {
        amount: quote.totalCents,
        currency: quote.currency.toLowerCase(),
        automatic_payment_methods: { enabled: true },
        receipt_email: auth.customer.email,
        metadata: {
          kind: "full",
          preorder_id: preorderId,
          customer_id: auth.customer.id,
          payment_terms: "full_upfront",
        },
      },
      { idempotencyKey: `preorder-checkout:${preorderId}` }
    );
    paymentIntentId = intent.id;

    const payment = await insertPayment(auth.supabase, {
      preorderId,
      providerPaymentId: intent.id,
      amountCents: quote.totalCents,
      currency: quote.currency,
    });

    return checkoutResultFromIntent({
      preorderId,
      paymentId: payment.id,
      intent,
      quote,
    });
  } catch (error) {
    await rollbackFailedPreorderCheckout(auth.supabase, {
      preorderId,
      paymentIntentId,
      stripe,
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

async function paymentByIntent(supabase: SupabaseClient, paymentIntentId: string) {
  const { data, error } = await supabase
    .from("payments")
    .select("id, order_id, preorder_id, kind, status")
    .eq("provider", "stripe")
    .eq("provider_payment_id", paymentIntentId)
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

function checkoutResultFromIntent(input: {
  preorderId: string;
  paymentId: string;
  intent: Stripe.PaymentIntent;
  quote: CheckoutQuote;
}): CheckoutResult {
  if (!input.intent.client_secret) {
    throw internalError("Payment intent is missing a client secret");
  }

  return {
    mode: "preorder",
    preorderId: input.preorderId,
    paymentId: input.paymentId,
    paymentIntentId: input.intent.id,
    clientSecret: input.intent.client_secret,
    publishableCurrency: input.quote.currency,
    amountCents: input.quote.totalCents,
    quote: input.quote,
  };
}

async function rollbackFailedPreorderCheckout(
  supabase: SupabaseClient,
  input: {
    preorderId: string | null;
    paymentIntentId: string | null;
    stripe: Stripe;
  }
): Promise<void> {
  if (input.paymentIntentId) {
    try {
      await input.stripe.paymentIntents.cancel(input.paymentIntentId);
    } catch {
      // The database state is still cancelled below. Stripe webhooks reconcile
      // an intent that races with this rollback.
    }
  }
  if (input.preorderId) {
    await supabase.from("preorders").update({ status: "cancelled" }).eq("id", input.preorderId);
  }
}
