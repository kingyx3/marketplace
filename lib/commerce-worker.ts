import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createHitPayClient, type HitPayClient } from "@/lib/hitpay";
import { handleHitPayEvent } from "@/lib/hitpay-webhooks";
import { sendOrderConfirmationEmail } from "@/lib/notifications";

interface ClaimedWebhook {
  id: string;
  event_type: string;
  payload: Record<string, unknown>;
}

interface ClaimedPaymentAttempt {
  id: string;
  order_id: string;
  payment_id: string | null;
  provider_payment_id: string;
  amount_cents: number;
  currency: string;
}

interface ClaimedOutboxEvent {
  id: string;
  topic: string;
  aggregate_id: string;
  payload: Record<string, unknown>;
}

export interface CommerceWorkerResult {
  workerId: string;
  paymentAttempts: { claimed: number; processed: number; failed: number };
  webhooks: { claimed: number; processed: number; failed: number };
  outbox: { claimed: number; processed: number; failed: number };
}

export async function runCommerceWorker(
  supabase: SupabaseClient,
  options: {
    workerId?: string;
    batchSize?: number;
    hitpay?: HitPayClient;
  } = {},
): Promise<CommerceWorkerResult> {
  const workerId = options.workerId ?? `commerce-${randomUUID()}`;
  const batchSize = Math.min(100, Math.max(1, options.batchSize ?? 25));
  const hitpay = options.hitpay ?? createHitPayClient();
  const result: CommerceWorkerResult = {
    workerId,
    paymentAttempts: { claimed: 0, processed: 0, failed: 0 },
    webhooks: { claimed: 0, processed: 0, failed: 0 },
    outbox: { claimed: 0, processed: 0, failed: 0 },
  };

  const attemptClaim = await supabase.rpc("claim_payment_attempts", {
    p_worker_id: workerId,
    p_limit: batchSize,
    p_lease_seconds: 90,
  });
  if (attemptClaim.error) throw new Error(attemptClaim.error.message);
  const attempts = (attemptClaim.data ?? []) as ClaimedPaymentAttempt[];
  result.paymentAttempts.claimed = attempts.length;

  for (const attempt of attempts) {
    try {
      const paymentRequest = await hitpay.getPaymentRequest(
        attempt.provider_payment_id,
      );
      const existingPayment = await supabase
        .from("payments")
        .select("id")
        .eq("provider", "hitpay")
        .eq("provider_payment_id", attempt.provider_payment_id)
        .maybeSingle();
      if (existingPayment.error) throw new Error(existingPayment.error.message);

      const payment = existingPayment.data
        ? { data: existingPayment.data, error: null }
        : await supabase
            .from("payments")
            .insert({
              order_id: attempt.order_id,
              provider: "hitpay",
              provider_payment_id: attempt.provider_payment_id,
              kind: "full",
              amount_cents: attempt.amount_cents,
              currency: attempt.currency,
              status: "pending",
            })
            .select("id")
            .single();
      if (payment.error || !payment.data) {
        throw new Error(
          payment.error?.message ?? "reconciled payment persistence failed",
        );
      }

      const attemptUpdate = await supabase
        .from("payment_attempts")
        .update({
          payment_id: payment.data.id,
          status: "succeeded",
          locked_at: null,
          locked_by: null,
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", attempt.id)
        .eq("locked_by", workerId);
      if (attemptUpdate.error) throw new Error(attemptUpdate.error.message);

      const providerStatus = paymentRequest.status.toLowerCase();
      if (["completed", "succeeded"].includes(providerStatus)) {
        await handleHitPayEvent(
          supabase,
          {
            object: "payment_request",
            type: "completed",
            payload: paymentRequest as unknown as Record<string, unknown>,
          },
          hitpay,
        );
      } else if (
        ["failed", "expired", "cancelled", "canceled"].includes(providerStatus)
      ) {
        await handleHitPayEvent(
          supabase,
          {
            object: "payment_request",
            type: "failed",
            payload: paymentRequest as unknown as Record<string, unknown>,
          },
          hitpay,
        );
      }
      result.paymentAttempts.processed += 1;
    } catch (error) {
      const attemptUpdate = await supabase
        .from("payment_attempts")
        .update({
          status: "result_unknown",
          locked_at: null,
          locked_by: null,
          last_error: errorMessage(error).slice(0, 2000),
          next_attempt_at: new Date(Date.now() + 60_000).toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", attempt.id)
        .eq("locked_by", workerId);
      if (attemptUpdate.error) throw new Error(attemptUpdate.error.message);
      result.paymentAttempts.failed += 1;
    }
  }

  const webhookClaim = await supabase.rpc("claim_webhook_events", {
    p_worker_id: workerId,
    p_limit: batchSize,
    p_lease_seconds: 90,
  });
  if (webhookClaim.error) throw new Error(webhookClaim.error.message);
  const webhooks = (webhookClaim.data ?? []) as ClaimedWebhook[];
  result.webhooks.claimed = webhooks.length;

  for (const event of webhooks) {
    try {
      const object = requiredString(
        event.payload.object,
        "stored webhook object is missing",
      );
      const type = requiredString(
        event.payload.type,
        "stored webhook type is missing",
      );
      await handleHitPayEvent(
        supabase,
        { object, type, payload: event.payload },
        hitpay,
      );
      await checkedRpc(supabase, "complete_webhook_event", {
        p_event_id: event.id,
        p_worker_id: workerId,
      });
      result.webhooks.processed += 1;
    } catch (error) {
      await checkedRpc(supabase, "fail_webhook_event", {
        p_event_id: event.id,
        p_worker_id: workerId,
        p_error: errorMessage(error),
        p_max_attempts: 10,
      });
      result.webhooks.failed += 1;
    }
  }

  const outboxClaim = await supabase.rpc("claim_outbox_events", {
    p_worker_id: workerId,
    p_limit: batchSize,
    p_lease_seconds: 90,
  });
  if (outboxClaim.error) throw new Error(outboxClaim.error.message);
  const outbox = (outboxClaim.data ?? []) as ClaimedOutboxEvent[];
  result.outbox.claimed = outbox.length;

  for (const event of outbox) {
    try {
      if (event.topic !== "order.confirmation") {
        throw new Error(`unsupported outbox topic: ${event.topic}`);
      }
      const notification = await sendOrderConfirmationEmail(
        supabase,
        event.aggregate_id,
      );
      if (!notification.ok) {
        throw new Error(
          notification.error ?? "order confirmation delivery failed",
        );
      }
      await checkedRpc(supabase, "complete_outbox_event", {
        p_event_id: event.id,
        p_worker_id: workerId,
      });
      result.outbox.processed += 1;
    } catch (error) {
      await checkedRpc(supabase, "fail_outbox_event", {
        p_event_id: event.id,
        p_worker_id: workerId,
        p_error: errorMessage(error),
        p_max_attempts: 10,
      });
      result.outbox.failed += 1;
    }
  }

  return result;
}

async function checkedRpc(
  supabase: SupabaseClient,
  name: string,
  params: Record<string, unknown>,
): Promise<void> {
  const { error } = await supabase.rpc(name, params);
  if (error) throw new Error(error.message);
}

function requiredString(value: unknown, message: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(message);
  return value;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
