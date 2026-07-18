import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";

import { sendOrderConfirmationEmail } from "@/lib/notifications";
import { createStripeClient } from "@/lib/stripe";

export async function handleStripeEvent(
  supabase: SupabaseClient,
  event: Stripe.Event,
  stripe: Stripe = createStripeClient()
): Promise<void> {
  switch (event.type) {
    case "payment_intent.amount_capturable_updated":
      await handlePaymentIntentAuthorized(supabase, event.data.object as Stripe.PaymentIntent);
      return;
    case "payment_intent.succeeded":
      await handlePaymentIntentSucceeded(
        supabase,
        event.data.object as Stripe.PaymentIntent,
        stripe
      );
      return;
    case "payment_intent.payment_failed":
      await handlePaymentIntentFailed(supabase, event.data.object as Stripe.PaymentIntent);
      return;
    case "charge.refunded":
      await handleChargeRefunded(supabase, event.data.object as Stripe.Charge);
      return;
    case "refund.created":
    case "refund.updated":
    case "refund.failed":
      await handleRefundEvent(supabase, event.data.object as Stripe.Refund);
      return;
    default:
      return;
  }
}

async function handlePaymentIntentAuthorized(
  supabase: SupabaseClient,
  intent: Stripe.PaymentIntent
): Promise<void> {
  const payment = await paymentByIntent(supabase, intent.id);
  if (!payment) return;

  await updatePayment(
    supabase,
    payment.id,
    { status: "authorized" },
    ["pending", "requires_capture"]
  );
}

async function handlePaymentIntentSucceeded(
  supabase: SupabaseClient,
  intent: Stripe.PaymentIntent,
  stripe: Stripe
): Promise<void> {
  const payment = await paymentByIntent(supabase, intent.id);
  const orderId = payment?.order_id ?? intent.metadata?.order_id ?? null;
  const preorderId = payment?.preorder_id ?? intent.metadata?.preorder_id ?? null;

  if (orderId) {
    const result = await settleOrderPayment(supabase, orderId, intent);
    if (result === "paid") {
      if (payment) {
        await updatePayment(
          supabase,
          payment.id,
          { status: "captured", captured_at: new Date().toISOString() },
          ["pending", "requires_capture", "authorized", "failed", "cancelled"]
        );
      }
      await sendOrderConfirmationEmail(supabase, orderId);
      return;
    }

    await refundLateOrderPayment(supabase, stripe, payment, orderId, intent, result);
    return;
  }

  if (!preorderId || !payment) return;

  await updatePayment(
    supabase,
    payment.id,
    { status: "captured", captured_at: new Date().toISOString() },
    ["pending", "requires_capture", "authorized", "failed"]
  );

  const { error } = await supabase
    .from("preorders")
    .update({ status: "paid", balance_cents: 0 })
    .eq("id", preorderId)
    .in("status", ["pending_payment", "pending_deposit", "deposited"]);
  if (error) throw new Error(error.message);
}

async function handlePaymentIntentFailed(
  supabase: SupabaseClient,
  intent: Stripe.PaymentIntent
): Promise<void> {
  const payment = await paymentByIntent(supabase, intent.id);
  const orderId = payment?.order_id ?? intent.metadata?.order_id ?? null;
  const preorderId = payment?.preorder_id ?? intent.metadata?.preorder_id ?? null;

  if (payment) {
    await updatePayment(
      supabase,
      payment.id,
      { status: "failed" },
      ["pending", "requires_capture", "authorized"]
    );
  }

  if (orderId) {
    await supabase.rpc("release_order_allocation", { p_order_id: orderId });
    const { error } = await supabase
      .from("orders")
      .update({ status: "cancelled", checkout_reserved_until: null })
      .eq("id", orderId)
      .in("status", ["pending_payment", "draft"]);
    if (error) throw new Error(error.message);
  }

  if (preorderId) {
    const { error } = await supabase
      .from("preorders")
      .update({ status: "cancelled" })
      .eq("id", preorderId)
      .eq("status", "pending_payment");
    if (error) throw new Error(error.message);
  }
}

async function settleOrderPayment(
  supabase: SupabaseClient,
  orderId: string,
  intent: Stripe.PaymentIntent
): Promise<"paid" | "expired" | "not_payable"> {
  const { data, error } = await supabase.rpc("settle_order_payment", {
    p_order_id: orderId,
    p_provider_payment_id: intent.id,
    p_amount_cents: intent.amount_received || intent.amount,
    p_currency: intent.currency,
  });
  if (error) throw new Error(error.message);
  if (data === "paid" || data === "expired" || data === "not_payable") return data;
  throw new Error("order payment settlement returned an invalid result");
}

async function refundLateOrderPayment(
  supabase: SupabaseClient,
  stripe: Stripe,
  payment: PaymentRecord | null,
  orderId: string,
  intent: Stripe.PaymentIntent,
  settlement: "expired" | "not_payable"
): Promise<void> {
  if (!payment) throw new Error("late order payment record not found");

  await updatePayment(
    supabase,
    payment.id,
    { status: "captured", captured_at: new Date().toISOString() },
    ["pending", "requires_capture", "authorized", "failed", "cancelled"]
  );

  const amount = intent.amount_received || intent.amount;
  const refund = await stripe.refunds.create(
    {
      payment_intent: intent.id,
      amount,
      metadata: {
        order_id: orderId,
        reason: settlement === "expired" ? "checkout_reservation_expired" : "order_not_payable",
      },
    },
    { idempotencyKey: `late-order-refund:${orderId}:${intent.id}` }
  );

  await upsertRefund(supabase, {
    paymentId: payment.id,
    refundId: refund.id,
    amountCents: refund.amount,
    currency: payment.currency,
    reason: settlement === "expired" ? "checkout_reservation_expired" : "order_not_payable",
    status: refundStatus(refund.status),
  });

  if (refund.status === "succeeded") {
    await updatePayment(supabase, payment.id, { status: "refunded" }, ["captured"]);
  }
}

async function handleChargeRefunded(
  supabase: SupabaseClient,
  charge: Stripe.Charge
): Promise<void> {
  const intentId = typeof charge.payment_intent === "string" ? charge.payment_intent : null;
  if (!intentId) return;

  const payment = await paymentByIntent(supabase, intentId);
  if (!payment) return;

  for (const refund of charge.refunds?.data ?? []) {
    await upsertRefund(supabase, {
      paymentId: payment.id,
      refundId: refund.id,
      amountCents: refund.amount,
      currency: payment.currency,
      reason: refund.metadata?.reason ?? refund.reason ?? null,
      status: refundStatus(refund.status),
    });
  }

  if (!charge.refunded) return;

  await updatePayment(
    supabase,
    payment.id,
    { status: "refunded" },
    ["captured", "cancelled", "refunded"]
  );
  if (payment.order_id) {
    await supabase
      .from("orders")
      .update({ status: "refunded" })
      .eq("id", payment.order_id)
      .in("status", ["paid", "packing", "shipped", "delivered", "cancelled"]);
  }
  if (payment.preorder_id) {
    await supabase
      .from("preorders")
      .update({ status: "refunded" })
      .eq("id", payment.preorder_id)
      .in("status", ["paid", "allocated", "refund_pending", "converted"]);
  }
}

async function handleRefundEvent(supabase: SupabaseClient, refund: Stripe.Refund): Promise<void> {
  const { data, error } = await supabase
    .from("refunds")
    .update({ status: refundStatus(refund.status) })
    .eq("provider_refund_id", refund.id)
    .select("payment_id");
  if (error) throw new Error(error.message);

  if (refund.status !== "succeeded") return;
  for (const row of data ?? []) {
    const paymentId = String(row.payment_id);
    const payment = await paymentById(supabase, paymentId);
    if (!payment) continue;

    const totals = await refundTotals(supabase, paymentId);
    if (totals >= payment.amount_cents) {
      await updatePayment(supabase, paymentId, { status: "refunded" }, ["captured"]);
    }
  }
}

async function upsertRefund(
  supabase: SupabaseClient,
  input: {
    paymentId: string;
    refundId: string;
    amountCents: number;
    currency: string;
    reason: string | null;
    status: "pending" | "succeeded" | "failed";
  }
): Promise<void> {
  const { error } = await supabase.from("refunds").upsert(
    {
      payment_id: input.paymentId,
      provider_refund_id: input.refundId,
      amount_cents: input.amountCents,
      currency: input.currency,
      reason: input.reason,
      status: input.status,
    },
    { onConflict: "provider_refund_id" }
  );
  if (error) throw new Error(error.message);
}

function refundStatus(status: Stripe.Refund["status"]): "pending" | "succeeded" | "failed" {
  if (status === "succeeded") return "succeeded";
  if (status === "failed" || status === "canceled") return "failed";
  return "pending";
}

interface PaymentRecord {
  id: string;
  order_id: string | null;
  preorder_id: string | null;
  kind: string;
  status: string;
  currency: string;
  amount_cents: number;
}

async function paymentByIntent(
  supabase: SupabaseClient,
  intentId: string
): Promise<PaymentRecord | null> {
  const { data, error } = await supabase
    .from("payments")
    .select("id, order_id, preorder_id, kind, status, currency, amount_cents")
    .eq("provider", "stripe")
    .eq("provider_payment_id", intentId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as PaymentRecord | null;
}

async function paymentById(supabase: SupabaseClient, id: string): Promise<PaymentRecord | null> {
  const { data, error } = await supabase
    .from("payments")
    .select("id, order_id, preorder_id, kind, status, currency, amount_cents")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as PaymentRecord | null;
}

async function refundTotals(supabase: SupabaseClient, paymentId: string): Promise<number> {
  const { data, error } = await supabase
    .from("refunds")
    .select("amount_cents")
    .eq("payment_id", paymentId)
    .eq("status", "succeeded");
  if (error) throw new Error(error.message);
  return (data ?? []).reduce((sum, row) => sum + Number(row.amount_cents), 0);
}

async function updatePayment(
  supabase: SupabaseClient,
  id: string,
  update: Record<string, unknown>,
  allowedStatuses?: string[]
): Promise<boolean> {
  let query = supabase.from("payments").update(update).eq("id", id);
  if (allowedStatuses?.length) query = query.in("status", allowedStatuses);
  const { data, error } = await query.select("id");
  if (error) throw new Error(error.message);
  return (data ?? []).length > 0;
}
