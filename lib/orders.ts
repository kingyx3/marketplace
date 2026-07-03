import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { notFound } from "@/lib/api/errors";
import type { CustomerRecord } from "@/lib/api/auth";

export const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

export const orderStatusUpdateSchema = z.object({
  status: z.enum(["draft", "pending_payment", "paid", "packing", "shipped", "delivered", "cancelled", "refunded"]),
});

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
  "id, channel, status, currency, subtotal_cents, shipping_cents, tax_cents, total_cents, placed_at, created_at, updated_at, order_items(id, sku_id, quantity, unit_price_cents), payments(id, provider, provider_payment_id, kind, amount_cents, currency, status, captured_at, created_at), shipments(id, carrier, tracking_number, status, shipped_at, delivered_at, created_at)";

const preorderSelect =
  "id, sku_id, channel, quantity, unit_price_cents, deposit_cents, balance_cents, currency, status, allocated_qty, order_id, created_at, updated_at, payments(id, provider, provider_payment_id, kind, amount_cents, currency, status, captured_at, created_at)";

export async function listCustomerOrders(
  supabase: SupabaseClient,
  customer: CustomerRecord,
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
  customer: CustomerRecord,
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
  customer: CustomerRecord,
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
  customer: CustomerRecord,
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

export async function updateAdminOrder(
  supabase: SupabaseClient,
  id: string,
  body: unknown
) {
  const input = orderStatusUpdateSchema.parse(body);
  const update: Record<string, unknown> = { status: input.status };
  if (input.status === "paid") {
    update.placed_at = new Date().toISOString();
  }

  const { data, error } = await supabase
    .from("orders")
    .update(update)
    .eq("id", id)
    .select(orderSelect)
    .single();
  if (error || !data) {
    throw new Error(error?.message ?? "order update failed");
  }
  return data;
}

export async function updateAdminPreorder(
  supabase: SupabaseClient,
  id: string,
  body: unknown
) {
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
