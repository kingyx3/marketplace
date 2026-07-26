import type { SupabaseClient } from "@supabase/supabase-js";

import {
  createHitPayClient,
  hitPayAmountToCents,
  hitPayRefundStatus,
  isHitPayRequestError,
  successfulHitPayChargeId,
  type HitPayClient,
} from "@/lib/hitpay";

export interface HitPayWebhookEvent {
  object: string;
  type: string;
  payload: Record<string, unknown>;
}

export async function handleHitPayEvent(
  supabase: SupabaseClient,
  event: HitPayWebhookEvent,
  hitpay: HitPayClient = createHitPayClient(),
): Promise<void> {
  const object = event.object.trim().toLowerCase();
  const type = event.type.trim().toLowerCase();

  if (object === "payment_request" && type === "completed") {
    await handlePaymentCompleted(supabase, event.payload, hitpay);
    return;
  }
  if (object === "payment_request" && type === "failed") {
    await handlePaymentFailed(supabase, event.payload);
    return;
  }
  if (object === "charge" && type === "updated") {
    await handleChargeUpdated(supabase, event.payload);
    return;
  }

  throw new Error(`Unsupported HitPay webhook event: ${object}.${type}`);
}

async function handlePaymentCompleted(
  supabase: SupabaseClient,
  payload: Record<string, unknown>,
  hitpay: HitPayClient,
): Promise<void> {
  const requestId = requiredString(
    payload.id,
    "HitPay webhook is missing payment request id",
  );
  const payment = await paymentByRequest(supabase, requestId);
  if (!payment) {
    throw new Error("HitPay payment is not persisted yet");
  }

  const chargeId = successfulHitPayChargeId(payload);
  if (!chargeId) {
    throw new Error(
      "HitPay completed webhook is missing a successful charge id",
    );
  }
  payment.provider_charge_id = chargeId;

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
      p_provider_charge_id: chargeId,
      p_amount_cents: amountCents,
      p_currency: currency,
    });
    if (error) throw new Error(error.message);
    if (data === "paid") return;
    if (data !== "expired" && data !== "not_payable") {
      throw new Error("order payment settlement returned an invalid result");
    }
    await refundNonPayablePayment(
      supabase,
      hitpay,
      payment,
      data === "expired" ? "checkout_reservation_expired" : "order_not_payable",
    );
    return;
  }

  if (!payment.preorder_id) return;
  await updatePayment(supabase, payment.id, { provider_charge_id: chargeId });
  payment.provider_charge_id = chargeId;
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
  await refundNonPayablePayment(
    supabase,
    hitpay,
    payment,
    "preorder_not_payable",
  );
}

async function handlePaymentFailed(
  supabase: SupabaseClient,
  payload: Record<string, unknown>,
): Promise<void> {
  const requestId = requiredString(
    payload.id,
    "HitPay webhook is missing payment request id",
  );
  const payment = await paymentByRequest(supabase, requestId);
  if (!payment) {
    throw new Error("HitPay payment is not persisted yet");
  }

  await updatePayment(supabase, payment.id, { status: "failed" }, [
    "pending",
    "requires_capture",
    "authorized",
  ]);

  if (payment.order_id) {
    await supabase.rpc("release_order_allocation", {
      p_order_id: payment.order_id,
    });
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
  reason: string,
): Promise<void> {
  if (!payment.provider_charge_id) {
    throw new Error(
      "HitPay charge id is required before a payment can be refunded",
    );
  }

  const attempt = await findOrCreateRefundAttempt(supabase, payment, reason);
  if (attempt.status === "succeeded") return;
  if (
    attempt.status === "result_unknown" ||
    attempt.status === "reconciliation_required"
  ) {
    throw new Error(
      "A previous refund result is unknown and requires reconciliation",
    );
  }

  await updateRefundAttempt(supabase, attempt.id, {
    status: "calling_provider",
    attempt_count: attempt.attemptCount + 1,
  });

  try {
    const refund = await hitpay.createRefund({
      paymentId: payment.provider_charge_id,
      amountCents: payment.amount_cents,
    });
    const status = hitPayRefundStatus(refund.status);
    const { error } = await supabase
      .from("refunds")
      .update({ provider_refund_id: refund.id, status })
      .eq("id", attempt.refundId);
    if (error) throw new Error(error.message);

    await updateRefundAttempt(supabase, attempt.id, {
      provider_refund_id: refund.id,
      status:
        status === "failed"
          ? "failed"
          : status === "succeeded"
            ? "succeeded"
            : "result_unknown",
      ...(status === "succeeded"
        ? { completed_at: new Date().toISOString() }
        : {}),
    });
    if (status === "succeeded") {
      await updatePayment(supabase, payment.id, { status: "refunded" }, [
        "captured",
      ]);
    }
  } catch (error) {
    await updateRefundAttempt(supabase, attempt.id, {
      status:
        isHitPayRequestError(error) && error.outcomeUnknown
          ? "result_unknown"
          : "failed",
      last_error: error instanceof Error ? error.message : String(error),
      next_attempt_at: new Date().toISOString(),
    });
    throw error;
  }
}

async function findOrCreateRefundAttempt(
  supabase: SupabaseClient,
  payment: PaymentRecord,
  reason: string,
): Promise<{
  id: string;
  refundId: string;
  status: string;
  attemptCount: number;
}> {
  const dedupeKey = `nonpayable:${payment.id}:${reason}`;
  const existing = await supabase
    .from("refund_attempts")
    .select("id, refund_id, status, attempt_count")
    .eq("dedupe_key", dedupeKey)
    .maybeSingle();
  if (existing.error) throw new Error(existing.error.message);
  if (existing.data) {
    return {
      id: String(existing.data.id),
      refundId: String(existing.data.refund_id),
      status: String(existing.data.status),
      attemptCount: Number(existing.data.attempt_count),
    };
  }

  const refund = await supabase
    .from("refunds")
    .insert({
      payment_id: payment.id,
      amount_cents: payment.amount_cents,
      currency: payment.currency,
      reason,
      status: "pending",
    })
    .select("id")
    .single();
  if (refund.error || !refund.data) {
    throw new Error(refund.error?.message ?? "refund record creation failed");
  }

  const attempt = await supabase
    .from("refund_attempts")
    .insert({
      refund_id: refund.data.id,
      payment_id: payment.id,
      provider: "hitpay",
      dedupe_key: dedupeKey,
      amount_cents: payment.amount_cents,
      currency: payment.currency,
      status: "created",
    })
    .select("id, refund_id, status, attempt_count")
    .single();
  if (attempt.error || !attempt.data) {
    throw new Error(attempt.error?.message ?? "refund attempt creation failed");
  }
  return {
    id: String(attempt.data.id),
    refundId: String(attempt.data.refund_id),
    status: String(attempt.data.status),
    attemptCount: Number(attempt.data.attempt_count),
  };
}

async function updateRefundAttempt(
  supabase: SupabaseClient,
  id: string,
  update: Record<string, unknown>,
): Promise<void> {
  const { error } = await supabase
    .from("refund_attempts")
    .update({ ...update, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

async function handleChargeUpdated(
  supabase: SupabaseClient,
  payload: Record<string, unknown>,
): Promise<void> {
  const refunds = Array.isArray(payload.refunds) ? payload.refunds : [];
  for (const raw of refunds) {
    if (!raw || typeof raw !== "object") continue;
    const refund = raw as Record<string, unknown>;
    if (typeof refund.id !== "string" || typeof refund.status !== "string")
      continue;

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
  paymentId: string,
): Promise<void> {
  const payment = await paymentById(supabase, paymentId);
  if (!payment) return;
  const { data, error } = await supabase
    .from("refunds")
    .select("amount_cents")
    .eq("payment_id", paymentId)
    .eq("status", "succeeded");
  if (error) throw new Error(error.message);
  const refunded = (data ?? []).reduce(
    (sum, row) => sum + Number(row.amount_cents),
    0,
  );
  if (refunded >= payment.amount_cents) {
    await updatePayment(supabase, paymentId, { status: "refunded" }, [
      "captured",
      "cancelled",
    ]);
  }
}

interface PaymentRecord {
  id: string;
  order_id: string | null;
  preorder_id: string | null;
  provider_payment_id: string;
  provider_charge_id: string | null;
  status: string;
  currency: string;
  amount_cents: number;
}

const paymentSelect =
  "id, order_id, preorder_id, provider_payment_id, provider_charge_id, status, currency, amount_cents";

async function paymentByRequest(
  supabase: SupabaseClient,
  requestId: string,
): Promise<PaymentRecord | null> {
  const { data, error } = await supabase
    .from("payments")
    .select(paymentSelect)
    .eq("provider", "hitpay")
    .eq("provider_payment_id", requestId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as PaymentRecord | null;
}

async function paymentById(
  supabase: SupabaseClient,
  id: string,
): Promise<PaymentRecord | null> {
  const { data, error } = await supabase
    .from("payments")
    .select(paymentSelect)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as PaymentRecord | null;
}

async function updatePayment(
  supabase: SupabaseClient,
  id: string,
  update: Record<string, unknown>,
  allowedStatuses?: string[],
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
