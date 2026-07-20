import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { POSTGRES_INTEGER_MAX } from "@/lib/admin-form-values";
import { badRequest, conflict, notFound } from "@/lib/api/errors";
import type { CustomerRecord } from "@/lib/api/auth";

type CustomerScope = Pick<CustomerRecord, "id">;

export const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

const paymentExceptionTypeSchema = z.enum([
  "webhook_processing_failure",
  "amount_currency_mismatch",
  "orphan_provider_payment",
  "stale_pending_payment",
  "failed_payment_allocation",
  "manual_flag",
]);

const paymentExceptionSeveritySchema = z.enum(["info", "warning", "critical"]);

export const adminOrderActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("mark_packing") }),
  z.object({
    action: z.literal("ship"),
    carrier: z.string().trim().min(1).max(80),
    trackingNumber: z.string().trim().min(1).max(120),
  }),
  z.object({
    action: z.literal("cancel_unpaid"),
    reason: z.string().trim().min(3).max(500),
  }),
  z.object({
    action: z.literal("flag_payment_exception"),
    paymentId: z.string().uuid().optional(),
    exceptionType: paymentExceptionTypeSchema.default("manual_flag"),
    severity: paymentExceptionSeveritySchema.default("warning"),
    detail: z.string().trim().min(3).max(1000),
  }),
  z.object({
    action: z.literal("record_manual_reconciliation"),
    provider: z.string().trim().min(2).max(40),
    providerPaymentId: z.string().trim().min(3).max(200),
    amountCents: z.number().int().positive().max(POSTGRES_INTEGER_MAX),
    currency: z
      .string()
      .trim()
      .regex(/^[A-Za-z]{3}$/)
      .transform((value) => value.toUpperCase()),
    reason: z.string().trim().min(3).max(500),
  }),
]);

export const preorderStatusUpdateSchema = z.object({
  status: z.enum([
    "pending_deposit",
    "deposited",
    "allocated",
    "balance_due",
    "paid",
    "converted",
    "cancelled",
    "refunded",
  ]),
  allocatedQty: z.number().int().min(0).optional(),
});

const orderSelect =
  "id, channel, status, currency, subtotal_cents, discount_cents, discount_bps, shipping_cents, shipping_address, shipping_service, tax_cents, total_cents, placed_at, created_at, updated_at, order_items(id, sku_id, quantity, unit_price_cents, booster_box_skus(sku, product_variants(products(slug, name)))), payments(id, provider, provider_payment_id, kind, amount_cents, currency, status, captured_at, created_at), shipments(id, carrier, tracking_number, status, shipped_at, delivered_at, created_at)";

const preorderSelect =
  "id, sku_id, channel, quantity, unit_price_cents, deposit_cents, balance_cents, allocation_refund_cents, allocation_confirmed_at, currency, status, allocated_qty, order_id, created_at, updated_at, booster_box_skus(sku, product_variants(products(slug, name))), payments(id, provider, provider_payment_id, kind, amount_cents, currency, status, captured_at, created_at)";

const openPaymentExceptionSelect =
  "id, order_id, payment_id, exception_type, severity, status, detail, actor, created_at, updated_at";

export async function listCustomerOrders(
  supabase: SupabaseClient,
  customer: CustomerScope,
  limit: number
) {
  const { data, error } = await supabase
    .from("orders")
    .select(orderSelect)
    .eq("customer_id", customer.id)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    throw new Error(error.message);
  }
  return data ?? [];
}

export async function getCustomerOrder(
  supabase: SupabaseClient,
  customer: CustomerScope,
  id: string
) {
  const { data, error } = await supabase
    .from("orders")
    .select(orderSelect)
    .eq("customer_id", customer.id)
    .eq("id", id)
    .maybeSingle();
  if (error) {
    throw new Error(error.message);
  }
  if (!data) {
    throw notFound("Order not found");
  }
  return data;
}

export async function listCustomerPreorders(
  supabase: SupabaseClient,
  customer: CustomerScope,
  limit: number
) {
  const { data, error } = await supabase
    .from("preorders")
    .select(preorderSelect)
    .eq("customer_id", customer.id)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    throw new Error(error.message);
  }
  return data ?? [];
}

export async function getCustomerPreorder(
  supabase: SupabaseClient,
  customer: CustomerScope,
  id: string
) {
  const { data, error } = await supabase
    .from("preorders")
    .select(preorderSelect)
    .eq("customer_id", customer.id)
    .eq("id", id)
    .maybeSingle();
  if (error) {
    throw new Error(error.message);
  }
  if (!data) {
    throw notFound("Pre-order not found");
  }
  return data;
}

export async function listAdminOrders(supabase: SupabaseClient, limit: number) {
  const { data, error } = await supabase
    .from("orders")
    .select(`${orderSelect}, customers(id, email, name, segment)`)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    throw new Error(error.message);
  }
  return data ?? [];
}

export async function getAdminOrder(supabase: SupabaseClient, id: string) {
  const orderId = z.string().uuid().parse(id);
  const { data, error } = await supabase
    .from("orders")
    .select(`${orderSelect}, customers(id, email, name, segment)`)
    .eq("id", orderId)
    .maybeSingle();
  if (error) {
    throw new Error(error.message);
  }
  if (!data) {
    throw notFound("Order not found");
  }
  return data;
}

export async function listAdminPreorders(supabase: SupabaseClient, limit: number) {
  const { data, error } = await supabase
    .from("preorders")
    .select(`${preorderSelect}, customers(id, email, name, segment)`)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    throw new Error(error.message);
  }
  return data ?? [];
}

export async function getAdminPreorder(supabase: SupabaseClient, id: string) {
  const preorderId = z.string().uuid().parse(id);
  const { data, error } = await supabase
    .from("preorders")
    .select(`${preorderSelect}, customers(id, email, name, segment)`)
    .eq("id", preorderId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw notFound("Preorder not found");
  return data;
}

export async function performAdminOrderAction(
  supabase: SupabaseClient,
  id: string,
  body: unknown,
  actor: string
) {
  const orderId = z.string().uuid().parse(id);
  const input = adminOrderActionSchema.parse(body);

  switch (input.action) {
    case "mark_packing":
      await checkedRpc(supabase, "admin_mark_order_packing", {
        p_order_id: orderId,
        p_actor: actor,
      });
      return getAdminOrder(supabase, orderId);
    case "ship":
      await checkedRpc(supabase, "admin_ship_order", {
        p_order_id: orderId,
        p_carrier: input.carrier,
        p_tracking_number: input.trackingNumber,
        p_actor: actor,
      });
      return getAdminOrder(supabase, orderId);
    case "cancel_unpaid":
      await checkedRpc(supabase, "admin_cancel_unpaid_order", {
        p_order_id: orderId,
        p_reason: input.reason,
        p_actor: actor,
      });
      return getAdminOrder(supabase, orderId);
    case "flag_payment_exception":
      await checkedRpc(supabase, "admin_flag_payment_exception", {
        p_order_id: orderId,
        p_payment_id: input.paymentId ?? null,
        p_exception_type: input.exceptionType,
        p_detail: input.detail,
        p_actor: actor,
        p_severity: input.severity,
      });
      return getAdminOrder(supabase, orderId);
    case "record_manual_reconciliation":
      await checkedRpc(supabase, "admin_record_manual_reconciliation", {
        p_order_id: orderId,
        p_provider: input.provider,
        p_provider_payment_id: input.providerPaymentId,
        p_amount_cents: input.amountCents,
        p_currency: input.currency,
        p_reason: input.reason,
        p_actor: actor,
      });
      return getAdminOrder(supabase, orderId);
    default:
      input satisfies never;
      throw badRequest("Unsupported admin order action");
  }
}

export async function listAdminOrderExceptions(supabase: SupabaseClient, now = new Date()) {
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
      .in("event_type", [
        "payment_intent.succeeded",
        "payment_intent.payment_failed",
        "payment_intent.amount_capturable_updated",
      ])
      .order("processed_at", { ascending: false })
      .limit(200),
  ]);

  for (const result of [manual, payments, webhookEvents]) {
    if (result.error) {
      throw new Error(result.error.message);
    }
  }

  return buildAdminOrderExceptionQueue({
    manualExceptions: manual.data ?? [],
    payments: payments.data ?? [],
    webhookEvents: webhookEvents.data ?? [],
    now,
  });
}

export async function updateAdminPreorder(supabase: SupabaseClient, id: string, body: unknown) {
  const input = preorderStatusUpdateSchema.parse(body);
  const update: Record<string, unknown> = { status: input.status };
  if (input.allocatedQty !== undefined) {
    update.allocated_qty = input.allocatedQty;
  }

  const { data, error } = await supabase
    .from("preorders")
    .update(update)
    .eq("id", id)
    .select(preorderSelect)
    .single();
  if (error || !data) {
    throw new Error(error?.message ?? "preorder update failed");
  }
  return data;
}

export function buildAdminOrderExceptionQueue(input: {
  manualExceptions: unknown[];
  payments: unknown[];
  webhookEvents: unknown[];
  now: Date;
}) {
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

    const createdAt = new Date(payment.created_at);
    const ageMs = input.now.getTime() - createdAt.getTime();
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
    const providerPaymentId = paymentIntentIdFromWebhookPayload(event.payload);
    if (!providerPaymentId || localProviderPaymentIds.has(providerPaymentId)) continue;

    pushException(exceptions, seen, {
      key: `orphan-provider-payment:${event.event_id}`,
      source: "derived",
      exceptionType: "orphan_provider_payment",
      severity: event.event_type === "payment_intent.succeeded" ? "critical" : "warning",
      orderId: null,
      paymentId: null,
      providerPaymentId,
      detail: `Stripe webhook ${event.event_type} has no matching local payment row.`,
      createdAt: event.processed_at,
    });
  }

  return exceptions.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
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

function paymentIntentIdFromWebhookPayload(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const data = "data" in payload ? payload.data : null;
  if (!data || typeof data !== "object") return null;
  const object = "object" in data ? data.object : null;
  if (!object || typeof object !== "object") return null;
  const id = "id" in object ? object.id : null;
  return typeof id === "string" && id.startsWith("pi_") ? id : null;
}

async function checkedRpc(supabase: SupabaseClient, name: string, params: Record<string, unknown>) {
  const { error } = await supabase.rpc(name, params);
  if (!error) return;

  if (error.code === "P0002") {
    throw notFound(error.message);
  }
  if (error.code === "P0001") {
    throw conflict(error.message);
  }
  if (error.code === "22023") {
    throw badRequest(error.message);
  }
  throw new Error(error.message);
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

export interface AdminOrderException {
  key: string;
  source: "manual" | "derived";
  exceptionType:
    | "webhook_processing_failure"
    | "amount_currency_mismatch"
    | "orphan_provider_payment"
    | "stale_pending_payment"
    | "failed_payment_allocation"
    | "manual_flag";
  severity: "info" | "warning" | "critical";
  orderId: string | null;
  paymentId: string | null;
  providerPaymentId: string | null;
  detail: string;
  createdAt: string;
}
