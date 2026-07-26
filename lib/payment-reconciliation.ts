import type { SupabaseClient } from "@supabase/supabase-js";

import {
  createHitPayClient,
  type HitPayClient,
} from "@/lib/hitpay";
import { handleHitPayEvent } from "@/lib/hitpay-webhooks";

export type OrderPaymentReconciliationResult =
  | "unchanged"
  | "completed"
  | "failed";

export async function reconcileOrderPayment(
  supabase: SupabaseClient,
  orderId: string,
  hitpay: HitPayClient = createHitPayClient(),
): Promise<OrderPaymentReconciliationResult> {
  const payment = await supabase
    .from("payments")
    .select("provider_payment_id, status")
    .eq("provider", "hitpay")
    .eq("order_id", orderId)
    .in("status", ["pending", "requires_capture", "authorized"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (payment.error) throw new Error(payment.error.message);
  if (!payment.data?.provider_payment_id) return "unchanged";

  const paymentRequest = await hitpay.getPaymentRequest(
    String(payment.data.provider_payment_id),
  );
  const status = paymentRequest.status.trim().toLowerCase();

  if (["completed", "succeeded"].includes(status)) {
    await handleHitPayEvent(
      supabase,
      {
        object: "payment_request",
        type: "completed",
        payload: paymentRequest as unknown as Record<string, unknown>,
      },
      hitpay,
    );
    return "completed";
  }

  if (["failed", "expired", "cancelled", "canceled"].includes(status)) {
    await handleHitPayEvent(
      supabase,
      {
        object: "payment_request",
        type: "failed",
        payload: paymentRequest as unknown as Record<string, unknown>,
      },
      hitpay,
    );
    return "failed";
  }

  return "unchanged";
}
