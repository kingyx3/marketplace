import type { SupabaseClient } from "@supabase/supabase-js";

export const deliveryStatuses = [
  "pending",
  "label_created",
  "in_transit",
  "delivered",
  "returned",
  "lost",
] as const;

export type DeliveryStatus = (typeof deliveryStatuses)[number];

export interface DeliveryPayment {
  id: string;
  amount_cents: number;
  currency: string;
  status: string;
  refunds?: Array<{ amount_cents: number; status: string }> | null;
}

export interface AdminDeliveryShipment {
  id: string;
  carrier: string | null;
  trackingNumber: string | null;
  status: DeliveryStatus;
  shippedAt: string | null;
  deliveredAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminDeliveryOrder {
  id: string;
  status: string;
  currency: string;
  totalCents: number;
  capturedCents: number;
  shippingAddress: Record<string, unknown> | null;
  shippingService: string | null;
  placedAt: string | null;
  createdAt: string;
  updatedAt: string;
  customer: { id: string; email: string; name: string | null } | null;
  items: Array<{ id: string; quantity: number; productName: string; sku: string | null }>;
  shipments: AdminDeliveryShipment[];
  latestShipment: AdminDeliveryShipment | null;
}

const deliveryOrderSelect =
  "id, status, currency, total_cents, shipping_address, shipping_service, placed_at, created_at, updated_at, customers(id, email, name), order_items(id, preorder_id, quantity, booster_box_skus(sku, product_variants(products(name))), preorders(id, payments(id, amount_cents, currency, status, refunds(amount_cents, status)))), payments(id, amount_cents, currency, status, refunds(amount_cents, status)), shipments(id, carrier, tracking_number, status, shipped_at, delivered_at, created_at, updated_at)";

export async function listAdminDeliveryOrders(
  supabase: SupabaseClient,
  limit = 100
): Promise<AdminDeliveryOrder[]> {
  const { data, error } = await supabase
    .from("orders")
    .select(deliveryOrderSelect)
    .in("status", ["paid", "packing", "shipped", "delivered"])
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(`Delivery order query failed: ${error.message}`);

  return ((data ?? []) as unknown as RawDeliveryOrder[])
    .map(mapDeliveryOrder)
    .filter((order) => order.capturedCents >= order.totalCents);
}

export function netCapturedPaymentTotal(
  payments: DeliveryPayment[],
  currency: string
): number {
  const seen = new Set<string>();
  const expectedCurrency = currency.toUpperCase();

  return payments.reduce((sum, payment) => {
    if (seen.has(payment.id)) return sum;
    seen.add(payment.id);

    if (!["captured", "refunded"].includes(payment.status)) return sum;
    if (payment.currency.toUpperCase() !== expectedCurrency) return sum;

    const refundedCents = (payment.refunds ?? [])
      .filter((refund) => refund.status === "succeeded")
      .reduce((refundSum, refund) => refundSum + Number(refund.amount_cents ?? 0), 0);

    return sum + Math.max(0, Number(payment.amount_cents ?? 0) - refundedCents);
  }, 0);
}

function mapDeliveryOrder(row: RawDeliveryOrder): AdminDeliveryOrder {
  const directPayments = row.payments ?? [];
  const preorderPayments = (row.order_items ?? []).flatMap(
    (item) => one(item.preorders)?.payments ?? []
  );
  const capturedCents = netCapturedPaymentTotal(
    [...directPayments, ...preorderPayments],
    row.currency
  );
  const shipments = (row.shipments ?? [])
    .map((shipment) => ({
      id: shipment.id,
      carrier: shipment.carrier,
      trackingNumber: shipment.tracking_number,
      status: shipment.status,
      shippedAt: shipment.shipped_at,
      deliveredAt: shipment.delivered_at,
      createdAt: shipment.created_at,
      updatedAt: shipment.updated_at,
    }))
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));

  return {
    id: row.id,
    status: row.status,
    currency: row.currency,
    totalCents: row.total_cents,
    capturedCents,
    shippingAddress: isRecord(row.shipping_address) ? row.shipping_address : null,
    shippingService: row.shipping_service,
    placedAt: row.placed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    customer: one(row.customers),
    items: (row.order_items ?? []).map((item) => ({
      id: item.id,
      quantity: item.quantity,
      productName:
        one(one(item.booster_box_skus)?.product_variants)?.products?.name ?? "Unknown product",
      sku: one(item.booster_box_skus)?.sku ?? null,
    })),
    shipments,
    latestShipment: shipments[0] ?? null,
  };
}

function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

interface RawDeliveryOrder {
  id: string;
  status: string;
  currency: string;
  total_cents: number;
  shipping_address: unknown;
  shipping_service: string | null;
  placed_at: string | null;
  created_at: string;
  updated_at: string;
  customers:
    | { id: string; email: string; name: string | null }
    | Array<{ id: string; email: string; name: string | null }>
    | null;
  order_items?: Array<{
    id: string;
    preorder_id: string | null;
    quantity: number;
    booster_box_skus:
      | {
          sku: string | null;
          product_variants:
            | { products: { name: string } | null }
            | Array<{ products: { name: string } | null }>
            | null;
        }
      | Array<{
          sku: string | null;
          product_variants:
            | { products: { name: string } | null }
            | Array<{ products: { name: string } | null }>
            | null;
        }>
      | null;
    preorders:
      | { id: string; payments?: DeliveryPayment[] | null }
      | Array<{ id: string; payments?: DeliveryPayment[] | null }>
      | null;
  }>;
  payments?: DeliveryPayment[] | null;
  shipments?: Array<{
    id: string;
    carrier: string | null;
    tracking_number: string | null;
    status: DeliveryStatus;
    shipped_at: string | null;
    delivered_at: string | null;
    created_at: string;
    updated_at: string;
  }> | null;
}
