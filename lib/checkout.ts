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
  };
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

export async function createPreorderBalancePayment(
  auth: ApiCustomerContext,
  preorderId: string,
  stripe: Stripe = createStripeClient()
): Promise<CheckoutResult> {
  const preorder = await payablePreorderBalance(auth, preorderId);
  await assertNoOpenBalancePayment(auth.supabase, preorder.id);

  let paymentIntentId: string | null = null;

  try {
    const intent = await stripe.paymentIntents.create({
      amount: preorder.balance_cents,
      currency: preorder.currency.toLowerCase(),
      automatic_payment_methods: { enabled: true },
      receipt_email: auth.customer.email,
      metadata: {
        kind: "balance",
        preorder_id: preorder.id,
        customer_id: auth.customer.id,
      },
    });
    paymentIntentId = intent.id;

    const payment = await insertPayment(auth.supabase, {
      preorderId: preorder.id,
      providerPaymentId: intent.id,
      kind: "balance",
      amountCents: preorder.balance_cents,
      currency: preorder.currency,
      status: "pending",
    });

    return checkoutResultFromIntent({
      mode: "preorder",
      preorderId: preorder.id,
      paymentId: payment.id,
      intent,
      quote: balanceQuoteFromPreorder(preorder),
    });
  } catch (error) {
    if (paymentIntentId) {
      try {
        await stripe.paymentIntents.cancel(paymentIntentId);
      } catch (cancelError) {
        console.error("Stripe balance payment cancellation failed:", safeErrorMessage(cancelError));
      }
    }
    throw error instanceof Error ? error : internalError();
  }
}

export function checkoutOrderRpcParams(authUserId: string, quote: CheckoutQuote) {
  return {
    p_auth_user_id: authUserId,
    p_items: quote.lines.map((line) => ({
      sku_id: line.skuId,
      quantity: line.quantity,
    })),
    p_channel: "b2c",
    p_expected_subtotal_cents: quote.subtotalCents,
    p_discount_cents: quote.discountCents,
    p_discount_bps: quote.discountBps,
    p_expected_total_cents: quote.totalCents,
  };
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
      .rpc("create_checkout_order_from_cart", checkoutOrderRpcParams(auth.user.id, quote))
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
      orderId,
      providerPaymentId: intent.id,
      kind: "full",
      amountCents: quote.totalCents,
      currency: quote.currency,
      status: "pending",
    });

    return checkoutResultFromIntent({
      mode: "order",
      orderId,
      paymentId: payment.id,
      intent,
      quote,
    });
  } catch (error) {
    await rollbackFailedCheckout(auth.supabase, { orderId, paymentIntentId, stripe });
    throw error instanceof Error ? error : internalError();
  }
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
  if (payment.preorder_id) {
    await assertCustomerPreorderIsCancellable(auth, payment.preorder_id, payment.kind);
  }

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
      .update({ status: "cancelled" })
      .eq("id", payment.order_id)
      .in("status", ["draft", "pending_payment"]);
    if (orderUpdate.error) throw new Error(orderUpdate.error.message);
  }

  if (payment.preorder_id && payment.kind !== "balance") {
    const preorderUpdate = await auth.supabase
      .from("preorders")
      .update({ status: "cancelled" })
      .eq("id", payment.preorder_id)
      .in("status", ["pending_deposit", "deposited"]);
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
    const createdPreorderId = String(preorder.data.id);
    preorderId = createdPreorderId;

    const intent = await stripe.paymentIntents.create({
      amount: quote.depositCents,
      currency: quote.currency.toLowerCase(),
      capture_method: "manual",
      setup_future_usage: "off_session",
      automatic_payment_methods: { enabled: true },
      receipt_email: auth.customer.email,
      metadata: {
        kind: "deposit",
        preorder_id: createdPreorderId,
        customer_id: auth.customer.id,
      },
    });
    paymentIntentId = intent.id;

    const payment = await insertPayment(auth.supabase, {
      preorderId: createdPreorderId,
      providerPaymentId: intent.id,
      kind: "deposit",
      amountCents: quote.depositCents,
      currency: quote.currency,
      status: "pending",
    });

    return checkoutResultFromIntent({
      mode: "preorder",
      preorderId: createdPreorderId,
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
    kind: "full" | "deposit" | "balance";
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
  preorderId: string,
  paymentKind: string
): Promise<void> {
  const { data, error } = await auth.supabase
    .from("preorders")
    .select("id, status")
    .eq("id", preorderId)
    .eq("customer_id", auth.customer.id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw notFound("Pre-order not found");

  const cancellableStatuses =
    paymentKind === "balance" ? ["balance_due"] : ["pending_deposit", "deposited"];
  if (!cancellableStatuses.includes(String(data.status))) {
    throw conflict("Pre-order can no longer be cancelled");
  }
}

async function payablePreorderBalance(
  auth: ApiCustomerContext,
  preorderId: string
): Promise<PayablePreorder> {
  const { data, error } = await auth.supabase
    .from("preorders")
    .select(
      "id, customer_id, sku_id, channel, quantity, unit_price_cents, deposit_cents, balance_cents, currency, status, allocated_qty, booster_box_skus(sku, product_variants(products(name)))"
    )
    .eq("id", preorderId)
    .eq("customer_id", auth.customer.id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw notFound("Pre-order not found");

  const preorder = data as PayablePreorder;
  if (preorder.status !== "balance_due") throw conflict("Pre-order balance is not due");
  if (preorder.allocated_qty <= 0) throw conflict("Pre-order has not been allocated");

  const remaining = Math.max(
    0,
    preorder.allocated_qty * preorder.unit_price_cents - preorder.deposit_cents
  );
  if (preorder.balance_cents <= 0 || preorder.balance_cents > remaining) {
    throw conflict("Pre-order balance is invalid");
  }

  return preorder;
}

async function assertNoOpenBalancePayment(supabase: SupabaseClient, preorderId: string) {
  const { data, error } = await supabase
    .from("payments")
    .select("id, status")
    .eq("preorder_id", preorderId)
    .eq("kind", "balance")
    .in("status", ["pending", "authorized", "captured"])
    .limit(1);
  if (error) throw new Error(error.message);

  const existing = data?.[0];
  if (!existing) return;
  throw conflict(
    existing.status === "captured"
      ? "Pre-order balance is already paid"
      : "Pre-order balance payment is already in progress"
  );
}

function balanceQuoteFromPreorder(preorder: PayablePreorder): CheckoutQuote {
  const sku = one(preorder.booster_box_skus);
  const variant = one(sku?.product_variants);
  const product = one(variant?.products);
  const subtotalCents = preorder.allocated_qty * preorder.unit_price_cents;

  return {
    mode: "preorder",
    channel: "b2c",
    currency: preorder.currency,
    lines: [
      {
        skuId: preorder.sku_id,
        sku: sku?.sku ?? preorder.sku_id,
        productName: product?.name ?? "Pre-order allocation",
        quantity: preorder.allocated_qty,
        unitPriceCents: preorder.unit_price_cents,
        lineTotalCents: subtotalCents,
        currency: preorder.currency,
        availableToSell: preorder.allocated_qty,
      },
    ],
    subtotalCents,
    discountBps: 0,
    discountCents: 0,
    totalCents: subtotalCents,
    depositCents: preorder.balance_cents,
    balanceCents: 0,
  };
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
  if (input.orderId) await rollbackAllocatedOrder(supabase, input.orderId);
  if (input.preorderId) {
    await supabase.from("preorders").update({ status: "cancelled" }).eq("id", input.preorderId);
  }
}

async function rollbackAllocatedOrder(supabase: SupabaseClient, orderId: string): Promise<void> {
  await supabase.rpc("release_order_allocation", { p_order_id: orderId });
  await supabase.from("orders").update({ status: "cancelled" }).eq("id", orderId);
}

function safeErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "unknown";
}

function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

type MaybeArray<T> = T | T[] | null | undefined;

interface PayablePreorder {
  id: string;
  customer_id: string;
  sku_id: string;
  channel: "b2c";
  quantity: number;
  unit_price_cents: number;
  deposit_cents: number;
  balance_cents: number;
  currency: string;
  status: string;
  allocated_qty: number;
  booster_box_skus?: MaybeArray<{
    sku: string;
    product_variants?: MaybeArray<{ products?: MaybeArray<{ name: string }> }>;
  }>;
}
