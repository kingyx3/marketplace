import type { SupabaseClient } from "@supabase/supabase-js";

import {
  createHitPayClient,
  hitPayAmountToCents,
  hitPayRefundStatus,
  type HitPayClient,
} from "@/lib/hitpay";
import { sendOrderConfirmationEmail } from "@/lib/notifications";

export interface HitPayWebhookEvent {
  object: string;
  type: string;
  payload: Record<string, unknown>;
}

export async function handleHitPayEvent(
  supabase: SupabaseClient,
  event: HitPayWebhookEvent,
  hitpay: HitPayClient = createHitPayClient()
): Promise<void> {
  if (event.object === "payment_request" && event.type === "completed") {
    await handlePaymentCompleted(supabase, event.payload, hitpay);
    return;
  }
  if (event.object === "payment_request" && event.type === "failed") {
    await handlePaymentFailed(supabase, event.payload);
    return;
  }
  if (event.object === "charge" && event.type === "updated") {
    await handleChargeUpdated(supabase, event.payload);
  }
}

async function handlePaymentCompleted(
  supabase: SupabaseClient,
  payload: Record<string, unknown>,
  hitpay: HitPayClient
): Promise<void> {
  const requestId = requiredString(payload.id, "HitPay webhook is missing payment request id");
  const payment = await paymentByRequest(supabase, requestId);
  if (!payment) return;

  const amountCents =
    payload.amount === undefined
      ? payment.amount_cents
      : hitPayAmountToCents(payload.amount as string | number);
  const currency =
    typeof payload.currency === "string" ? payload.currency : payment.currency;

  if (payment.order_id) {
    const { data, error } = await supabase.rpc("settle_order_payment", {
      p_order_id: payment.order_id,
      p_provider_payment_id: requestId,
      p_amount_cents: amountCents,
      p_currency: currency,
    });
    if (error) throw new Error(error.message);
    if (data === "paid") {
      await sendOrderConfirmationEmail(supabase, payment.order_id);
      return;
    }
    if (data !== "expired" && data !== "not_payable") {
      throw new Error("order payment settlement returned an invalid result");
    }
    await refundNonPayablePayment(
      supabase,
      hitpay,
      payment,
      data === "expired" ? "checkout_reservation_expired" : "order_not_payable"
    );
    return;
  }

  if (!payment.preorder_id) return;
  const { data, error } = await supabase.rpc("settle_preorder_payment", {
    p_preorder_id: payment.preorder_id,
    p_provider_payment_id: requestId,
    p_amount_cents: amountCents,
    p_currency: currency,
  });
  if (error) throw new Error(error.message);
  if (data === "paid") return;
  if (data !== "not_payable") {
    throw new Error("preorder payment settlement returned an invalid result");
  }
  await refundNonPayablePayment(supabase, hitpay, payment, "preorder_not_payable");
}

async function handlePaymentFailed(
  supabase: SupabaseClient,
  payload: Record<string, unknown>
): Promise<void> {
  const requestId = requiredString(payload.id, "HitPay webhook is missing payment request id");
  const payment = await paymentByRequest(supabase, requestId);
  if (!payment) return;

  await updatePayment(
    supabase,
    payment.id,
    { status: "failed" },
    ["pending", "requires_capture", "authorized"]
  );

  if (payment.order_id) {
    await supabase.rpc("release_order_allocation", { p_order_id: payment.order_id });
    const { error } = await supabase
      .from("orders")
      .update({ status: "cancelled", checkout_reserved_until: null })
      .eq("id", payment.order_id)
      .in("status", ["pending_payment", "draft"]);
    if (error) throw new Error(error.message);
  }

  if (payment.preorder_id) {
    const { error } = await supabase
      .from("preorders")
      .update({ status: "cancelled" })
      .eq("id", payment.preorder_id)
      .eq("status", "pending_payment");
    if (error) throw new Error(error.message);
  }
}

async function refundNonPayablePayment(
  supabase: SupabaseClient,
  hitpay: HitPayClient,
  payment: PaymentRecord,
  reason: string
): Promise<void> {
  await updatePayment(
    supabase,
    payment.id,
    { status: "captured", captured_at: new Date().toISOString() },
    ["pending", "requires_capture", "authorized", "failed", "cancelled"]
  );

  const refund = await hitpay.createRefund({
    paymentId: payment.provider_payment_id,
    amountCents: payment.amount_cents,
  });
  const status = hitPayRefundStatus(refund.status);
  const { error } = await supabase.from("refunds").upsert(
    {
      payment_id: payment.id,
      provider_refund_id: refund.id,
      amount_cents: payment.amount_cents,
      currency: payment.currency,
      reason,
      status,
    },
    { onConflict: "provider_refund_id" }
  );
  if (error) throw new Error(error.message);

  if (status === "succeeded") {
    await updatePayment(supabase, payment.id, { status: "refunded" }, ["captured"]);
  }
}

async function handleChargeUpdated(
  supabase: SupabaseClient,
  payload: Record<string, unknown>
): Promise<void> {
  const refunds = Array.isArray(payload.refunds) ? payload.refunds : [];
  for (const raw of refunds) {
    if (!raw || typeof raw !== "object") continue;
    const refund = raw as Record<string, unknown>;
    if (typeof refund.id !== "string" || typeof refund.status !== "string") continue;

    const status = hitPayRefundStatus(refund.status);
    const { data, error } = await supabase
      .from("refunds")
      .update({ status })
      .eq("provider_refund_id", refund.id)
      .select("payment_id");
    if (error) throw new Error(error.message);
    if (status !== "succeeded") continue;

    for (const row of data ?? []) {
      await markFullyRefundedIfComplete(supabase, String(row.payment_id));
    }
  }
}

async function markFullyRefundedIfComplete(
  supabase: SupabaseClient,
  paymentId: string
): Promise<void> {
  const payment = await paymentById(supabase, paymentId);
  if (!payment) return;
  const { data, error } = await supabase
    .from("refunds")
    .select("amount_cents")
    .eq("payment_id", paymentId)
    .eq("status", "succeeded");
  if (error) throw new Error(error.message);
  const refunded = (data ?? []).reduce((sum, row) => sum + Number(row.amount_cents), 0);
  if (refunded >= payment.amount_cents) {
    await updatePayment(
      supabase,
      paymentId,
      { status: "refunded" },
      ["captured", "cancelled"]
    );
  }
}

interface PaymentRecord {
  id: string;
  order_id: string | null;
  preorder_id: string | null;
  provider_payment_id: string;
  status: string;
  currency: string;
  amount_cents: number;
}

async function paymentByRequest(
  supabase: SupabaseClient,
  requestId: string
): Promise<PaymentRecord | null> {
  const { data, error } = await supabase
    .from("payments")
    .select(
      "id, order_id, preorder_id, provider_payment_id, status, currency, amount_cents"
    )
    .eq("provider", "hitpay")
    .eq("provider_payment_id", requestId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as PaymentRecord | null;
}

async function paymentById(
  supabase: SupabaseClient,
  id: string
): Promise<PaymentRecord | null> {
  const { data, error } = await supabase
    .from("payments")
    .select(
      "id, order_id, preorder_id, provider_payment_id, status, currency, amount_cents"
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as PaymentRecord | null;
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
  return (data?.length ?? 0) > 0;
}

function requiredString(value: unknown, message: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(message);
  return value;
}
