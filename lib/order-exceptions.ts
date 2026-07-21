import type { SupabaseClient } from "@supabase/supabase-js";

import type { AdminOrderException } from "@/lib/orders";

const openPaymentExceptionSelect =
  "id, order_id, payment_id, exception_type, severity, status, detail, actor, created_at, updated_at";

export async function listAdminOrderExceptions(
  supabase: SupabaseClient,
  now = new Date()
): Promise<AdminOrderException[]> {
  const [manual, payments, webhookEvents] = await Promise.all([
    supabase
      .from("payment_exceptions")
      .select(openPaymentExceptionSelect)
      .eq("status", "open")
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("payments")
      .select(
        "id, order_id, preorder_id, provider, provider_payment_id, kind, amount_cents, currency, status, created_at, orders(id, status, total_cents, currency), preorders(id, status)"
      )
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("webhook_events")
      .select("id, event_id, event_type, payload, processed_at")
      .eq("provider", "hitpay")
      .in("event_type", ["payment_request.completed", "payment_request.failed", "charge.updated"])
      .order("processed_at", { ascending: false })
      .limit(200),
  ]);

  for (const result of [manual, payments, webhookEvents]) {
    if (result.error) throw new Error(result.error.message);
  }

  return buildAdminOrderExceptionQueue({
    manualExceptions: manual.data ?? [],
    payments: payments.data ?? [],
    webhookEvents: webhookEvents.data ?? [],
    now,
  });
}

export function buildAdminOrderExceptionQueue(input: {
  manualExceptions: unknown[];
  payments: unknown[];
  webhookEvents: unknown[];
  now: Date;
}): AdminOrderException[] {
  const exceptions: AdminOrderException[] = [];
  const seen = new Set<string>();

  for (const row of input.manualExceptions) {
    const exception = row as PaymentExceptionRow;
    pushException(exceptions, seen, {
      key: `manual:${exception.id}`,
      source: "manual",
      exceptionType: exception.exception_type,
      severity: exception.severity,
      orderId: exception.order_id,
      paymentId: exception.payment_id,
      providerPaymentId: null,
      detail: exception.detail,
      createdAt: exception.created_at,
    });
  }

  const localProviderPaymentIds = new Set<string>();
  for (const row of input.payments) {
    const payment = row as PaymentExceptionPaymentRow;
    if (payment.provider_payment_id) {
      localProviderPaymentIds.add(payment.provider_payment_id);
    }

    const ageMs = input.now.getTime() - new Date(payment.created_at).getTime();
    if (
      ["pending", "requires_capture", "authorized"].includes(payment.status) &&
      ageMs > 24 * 60 * 60 * 1000
    ) {
      pushException(exceptions, seen, {
        key: `stale:${payment.id}`,
        source: "derived",
        exceptionType: "stale_pending_payment",
        severity: "warning",
        orderId: payment.order_id,
        paymentId: payment.id,
        providerPaymentId: payment.provider_payment_id,
        detail: "Payment has remained pending for more than 24 hours.",
        createdAt: payment.created_at,
      });
    }

    const order = one(payment.orders);
    if (
      payment.order_id &&
      ["failed", "cancelled"].includes(payment.status) &&
      order &&
      ["draft", "pending_payment"].includes(order.status)
    ) {
      pushException(exceptions, seen, {
        key: `failed-allocation:${payment.id}`,
        source: "derived",
        exceptionType: "failed_payment_allocation",
        severity: "critical",
        orderId: payment.order_id,
        paymentId: payment.id,
        providerPaymentId: payment.provider_payment_id,
        detail: "Failed or cancelled payment is still attached to an unpaid order.",
        createdAt: payment.created_at,
      });
    }
  }

  for (const row of input.webhookEvents) {
    const event = row as WebhookEventRow;
    const providerPaymentId = paymentRequestIdFromWebhookPayload(event.payload);
    if (!providerPaymentId || localProviderPaymentIds.has(providerPaymentId)) continue;

    pushException(exceptions, seen, {
      key: `orphan-provider-payment:${event.event_id}`,
      source: "derived",
      exceptionType: "orphan_provider_payment",
      severity: event.event_type === "payment_request.completed" ? "critical" : "warning",
      orderId: null,
      paymentId: null,
      providerPaymentId,
      detail: `HitPay webhook ${event.event_type} has no matching local payment row.`,
      createdAt: event.processed_at,
    });
  }

  return exceptions.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

function paymentRequestIdFromWebhookPayload(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const id = "id" in payload ? payload.id : null;
  return typeof id === "string" ? id : null;
}

function pushException(
  exceptions: AdminOrderException[],
  seen: Set<string>,
  exception: AdminOrderException
) {
  if (seen.has(exception.key)) return;
  seen.add(exception.key);
  exceptions.push(exception);
}

function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

interface PaymentExceptionRow {
  id: string;
  order_id: string | null;
  payment_id: string | null;
  exception_type: AdminOrderException["exceptionType"];
  severity: AdminOrderException["severity"];
  detail: string;
  created_at: string;
}

interface PaymentExceptionPaymentRow {
  id: string;
  order_id: string | null;
  preorder_id: string | null;
  provider_payment_id: string;
  status: string;
  created_at: string;
  orders?: { id: string; status: string; total_cents: number; currency: string } | null;
}

interface WebhookEventRow {
  id: string;
  event_id: string;
  event_type: string;
  payload: unknown;
  processed_at: string;
}
