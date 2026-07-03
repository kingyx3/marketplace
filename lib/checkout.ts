import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import { badRequest, internalError } from "@/lib/api/errors";
import type { ApiCustomerContext } from "@/lib/api/auth";
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
}

export async function createCheckoutPayment(
  auth: ApiCustomerContext,
  body: unknown,
  stripe: Stripe = createStripeClient()
): Promise<CheckoutResult> {
  const request = checkoutRequestSchema.parse(body) as CheckoutRequest;
  const quote = await quoteCheckout(auth.supabase, request, auth.customer);

  if (quote.depositCents <= 0) {
    throw badRequest("Checkout total must be greater than zero");
  }

  return quote.mode === "preorder"
    ? createPreorderPayment(auth, quote, stripe)
    : createOrderPayment(auth, quote, stripe);
}

async function createOrderPayment(
  auth: ApiCustomerContext,
  quote: CheckoutQuote,
  stripe: Stripe
): Promise<CheckoutResult> {
  let orderId: string | null = null;
  let paymentIntentId: string | null = null;

  try {
    const order = await auth.supabase
      .rpc("create_checkout_order_from_cart", {
        p_auth_user_id: auth.user.id,
        p_items: quote.lines.map((line) => ({
          sku_id: line.skuId,
          quantity: line.quantity,
        })),
        p_channel: quote.channel,
      })
      .single();
    if (order.error || !order.data) {
      throw new Error(order.error?.message ?? "order creation failed");
    }
    orderId = (order.data as { order_id: string }).order_id;

    const intent = await stripe.paymentIntents.create({
      amount: quote.totalCents,
      currency: quote.currency.toLowerCase(),
      automatic_payment_methods: { enabled: true },
      receipt_email: auth.customer.email,
      metadata: {
        kind: "full",
        order_id: orderId,
        customer_id: auth.customer.id,
      },
    });
    paymentIntentId = intent.id;

    const payment = await insertPayment(auth.supabase, {
      orderId: orderId ?? undefined,
      providerPaymentId: intent.id,
      kind: "full",
      amountCents: quote.totalCents,
      currency: quote.currency,
      status: "pending",
    });

    return checkoutResultFromIntent({
      mode: "order",
      orderId: orderId ?? undefined,
      paymentId: payment.id,
      intent,
      quote,
    });
  } catch (error) {
    await rollbackFailedCheckout(auth.supabase, { orderId, paymentIntentId, stripe });
    throw error instanceof Error ? error : internalError();
  }
}

async function createPreorderPayment(
  auth: ApiCustomerContext,
  quote: CheckoutQuote,
  stripe: Stripe
): Promise<CheckoutResult> {
  const line = quote.lines[0];
  if (!line) {
    throw badRequest("Pre-order checkout requires one line");
  }

  let preorderId: string | null = null;
  let paymentIntentId: string | null = null;

  try {
    const preorder = await auth.supabase
      .from("preorders")
      .insert({
        customer_id: auth.customer.id,
        sku_id: line.skuId,
        channel: quote.channel,
        quantity: line.quantity,
        unit_price_cents: line.unitPriceCents,
        deposit_cents: quote.depositCents,
        balance_cents: quote.balanceCents,
        currency: quote.currency,
        status: "pending_deposit",
      })
      .select("id")
      .single();
    if (preorder.error || !preorder.data) {
      throw new Error(preorder.error?.message ?? "preorder insert failed");
    }
    preorderId = preorder.data.id;

    const intent = await stripe.paymentIntents.create({
      amount: quote.depositCents,
      currency: quote.currency.toLowerCase(),
      setup_future_usage: "off_session",
      automatic_payment_methods: { enabled: true },
      receipt_email: auth.customer.email,
      metadata: {
        kind: "deposit",
        preorder_id: preorderId,
        customer_id: auth.customer.id,
      },
    });
    paymentIntentId = intent.id;

    const payment = await insertPayment(auth.supabase, {
      preorderId: preorderId ?? undefined,
      providerPaymentId: intent.id,
      kind: "deposit",
      amountCents: quote.depositCents,
      currency: quote.currency,
      status: "pending",
    });

    return checkoutResultFromIntent({
      mode: "preorder",
      preorderId: preorderId ?? undefined,
      paymentId: payment.id,
      intent,
      quote,
    });
  } catch (error) {
    await rollbackFailedCheckout(auth.supabase, { preorderId, paymentIntentId, stripe });
    throw error instanceof Error ? error : internalError();
  }
}

async function insertPayment(
  supabase: SupabaseClient,
  input: {
    orderId?: string;
    preorderId?: string;
    providerPaymentId: string;
    kind: "full" | "deposit" | "balance";
    amountCents: number;
    currency: string;
    status: "pending" | "requires_capture";
  }
): Promise<{ id: string }> {
  const { data, error } = await supabase
    .from("payments")
    .insert({
      order_id: input.orderId,
      preorder_id: input.preorderId,
      provider_payment_id: input.providerPaymentId,
      kind: input.kind,
      amount_cents: input.amountCents,
      currency: input.currency,
      status: input.status,
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "payment insert failed");
  }

  return { id: data.id };
}

function checkoutResultFromIntent(input: {
  mode: "order" | "preorder";
  orderId?: string;
  preorderId?: string;
  paymentId: string;
  intent: Stripe.PaymentIntent;
  quote: CheckoutQuote;
}): CheckoutResult {
  if (!input.intent.client_secret) {
    throw internalError("Payment intent is missing a client secret");
  }

  return {
    mode: input.mode,
    orderId: input.orderId,
    preorderId: input.preorderId,
    paymentId: input.paymentId,
    paymentIntentId: input.intent.id,
    clientSecret: input.intent.client_secret,
    publishableCurrency: input.quote.currency,
    amountCents: input.quote.depositCents,
    quote: input.quote,
  };
}

async function rollbackFailedCheckout(
  supabase: SupabaseClient,
  input: {
    orderId?: string | null;
    preorderId?: string | null;
    paymentIntentId?: string | null;
    stripe: Stripe;
  }
): Promise<void> {
  if (input.paymentIntentId) {
    try {
      await input.stripe.paymentIntents.cancel(input.paymentIntentId);
    } catch (error) {
      console.error("Stripe payment intent cancellation failed:", safeErrorMessage(error));
    }
  }

  if (input.orderId) {
    await supabase.rpc("release_order_allocation", { p_order_id: input.orderId });
    await supabase.from("orders").update({ status: "cancelled" }).eq("id", input.orderId);
  }
  if (input.preorderId) {
    await supabase.from("preorders").update({ status: "cancelled" }).eq("id", input.preorderId);
  }
}

function safeErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "unknown";
}
