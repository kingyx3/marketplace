import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendOrderConfirmationEmail } from "@/lib/notifications";

export async function handleStripeEvent(
  supabase: SupabaseClient,
  event: Stripe.Event
): Promise<void> {
  switch (event.type) {
    case "payment_intent.amount_capturable_updated":
      await handlePaymentIntentAuthorized(supabase, event.data.object as Stripe.PaymentIntent);
      return;
    case "payment_intent.succeeded":
      await handlePaymentIntentSucceeded(supabase, event.data.object as Stripe.PaymentIntent);
      return;
    case "payment_intent.payment_failed":
      await handlePaymentIntentFailed(supabase, event.data.object as Stripe.PaymentIntent);
      return;
    case "charge.refunded":
      await handleChargeRefunded(supabase, event.data.object as Stripe.Charge);
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

  await updatePayment(supabase, payment.id, { status: "authorized" });
  if (payment.preorder_id) {
    await supabase
      .from("preorders")
      .update({ status: payment.kind === "deposit" ? "deposited" : "balance_due" })
      .eq("id", payment.preorder_id)
      .in("status", ["pending_deposit", "balance_due"]);
  }
}

async function handlePaymentIntentSucceeded(
  supabase: SupabaseClient,
  intent: Stripe.PaymentIntent
): Promise<void> {
  const payment = await paymentByIntent(supabase, intent.id);
  if (!payment) {
    const orderId = intent.metadata?.order_id;
    if (orderId) {
      await markOrderPaidFromIntent(supabase, orderId, intent);
      await sendOrderConfirmationEmail(supabase, orderId);
    }
    return;
  }

  if (payment.order_id) {
    await markOrderPaidFromIntent(supabase, payment.order_id, intent);
    await updatePayment(supabase, payment.id, {
      status: "captured",
      captured_at: new Date().toISOString(),
    });
    await sendOrderConfirmationEmail(supabase, payment.order_id);
    return;
  }

  if (payment.preorder_id) {
    await updatePayment(supabase, payment.id, {
      status: "captured",
      captured_at: new Date().toISOString(),
    });
    await supabase
      .from("preorders")
      .update({ status: payment.kind === "deposit" ? "deposited" : "paid" })
      .eq("id", payment.preorder_id)
      .in("status", ["pending_deposit", "deposited", "balance_due"]);
  }
}

async function handlePaymentIntentFailed(
  supabase: SupabaseClient,
  intent: Stripe.PaymentIntent
): Promise<void> {
  const payment = await paymentByIntent(supabase, intent.id);
  if (!payment) {
    const orderId = intent.metadata?.order_id;
    if (orderId) {
      await supabase.rpc("release_order_allocation", { p_order_id: orderId });
      await supabase
        .from("orders")
        .update({ status: "cancelled" })
        .eq("id", orderId)
        .in("status", ["pending_payment", "draft"]);
    }
    return;
  }

  await updatePayment(supabase, payment.id, { status: "failed" });
  if (payment.order_id) {
    await supabase.rpc("release_order_allocation", { p_order_id: payment.order_id });
    await supabase
      .from("orders")
      .update({ status: "cancelled" })
      .eq("id", payment.order_id)
      .in("status", ["pending_payment", "draft"]);
  }
}

async function markOrderPaidFromIntent(
  supabase: SupabaseClient,
  orderId: string,
  intent: Stripe.PaymentIntent
): Promise<void> {
  const { error } = await supabase.rpc("mark_order_paid", {
    p_order_id: orderId,
    p_provider_payment_id: intent.id,
    p_amount_cents: intent.amount_received || intent.amount,
    p_currency: intent.currency,
  });

  if (error) {
    throw new Error(error.message);
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

  const refundedCents = charge.amount_refunded ?? 0;
  if (refundedCents <= 0) return;

  await supabase.from("refunds").insert({
    payment_id: payment.id,
    provider_refund_id: latestRefundId(charge),
    amount_cents: refundedCents,
    currency: payment.currency,
    status: charge.refunded ? "succeeded" : "pending",
  });

  if (charge.refunded) {
    await updatePayment(supabase, payment.id, { status: "refunded" });
    if (payment.order_id) {
      await supabase.from("orders").update({ status: "refunded" }).eq("id", payment.order_id);
    }
    if (payment.preorder_id) {
      await supabase.from("preorders").update({ status: "refunded" }).eq("id", payment.preorder_id);
    }
  }
}

function latestRefundId(charge: Stripe.Charge): string | null {
  const refunds = charge.refunds?.data;
  const latest = refunds?.[0];
  return latest?.id ?? null;
}

async function paymentByIntent(supabase: SupabaseClient, intentId: string) {
  const { data, error } = await supabase
    .from("payments")
    .select("id, order_id, preorder_id, kind, status, currency")
    .eq("provider", "stripe")
    .eq("provider_payment_id", intentId)
    .maybeSingle();
  if (error) {
    throw new Error(error.message);
  }
  return data;
}

async function updatePayment(
  supabase: SupabaseClient,
  id: string,
  update: Record<string, unknown>
): Promise<void> {
  const { error } = await supabase.from("payments").update(update).eq("id", id);
  if (error) {
    throw new Error(error.message);
  }
}
