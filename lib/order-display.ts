import type { TimelineItem } from "@/app/_components/timeline";

type MaybeArray<T> = T | T[] | null | undefined;

interface ProductRelation {
  slug: string | null;
  name: string | null;
}

interface VariantRelation {
  products?: MaybeArray<ProductRelation>;
}

interface SkuRelation {
  sku: string | null;
  product_variants?: MaybeArray<VariantRelation>;
}

export interface LiveOrderItem {
  id?: string;
  sku_id: string;
  quantity: number;
  unit_price_cents: number;
  booster_box_skus?: MaybeArray<SkuRelation>;
}

export interface LivePayment {
  id?: string;
  kind?: string | null;
  amount_cents?: number | null;
  currency?: string | null;
  status?: string | null;
  captured_at?: string | null;
  created_at?: string | null;
}

export interface LiveShipment {
  carrier?: string | null;
  tracking_number?: string | null;
  status?: string | null;
  shipped_at?: string | null;
  delivered_at?: string | null;
  created_at?: string | null;
}

export interface LiveOrder {
  id: string;
  channel: string;
  status: string;
  currency: string;
  subtotal_cents: number;
  discount_cents?: number | null;
  shipping_cents?: number | null;
  tax_cents?: number | null;
  total_cents: number;
  placed_at?: string | null;
  created_at: string;
  updated_at?: string | null;
  order_items?: LiveOrderItem[] | null;
  payments?: LivePayment[] | null;
  shipments?: LiveShipment[] | null;
}

export interface LivePreorder {
  id: string;
  sku_id: string;
  channel: string;
  quantity: number;
  unit_price_cents: number;
  deposit_cents: number;
  balance_cents: number;
  currency: string;
  status: string;
  allocated_qty: number;
  order_id?: string | null;
  created_at: string;
  updated_at?: string | null;
  booster_box_skus?: MaybeArray<SkuRelation>;
  payments?: LivePayment[] | null;
}

export function formatStatus(status: string): string {
  return status
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function formatDate(value?: string | null): string {
  if (!value) return "Pending";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Pending";
  return new Intl.DateTimeFormat("en-SG", { dateStyle: "medium" }).format(date);
}

export function orderItemCount(order: LiveOrder): number {
  return (order.order_items ?? []).reduce((sum, item) => sum + Number(item.quantity ?? 0), 0);
}

export function productNameForItem(item: LiveOrderItem | LivePreorder): string {
  return productForSku(item.booster_box_skus)?.name ?? skuForItem(item) ?? item.sku_id;
}

export function skuForItem(item: LiveOrderItem | LivePreorder): string | null {
  return one(item.booster_box_skus)?.sku ?? null;
}

export function productHrefForItem(item: LiveOrderItem | LivePreorder): string | null {
  const slug = productForSku(item.booster_box_skus)?.slug;
  return slug ? `/catalog/${slug}` : null;
}

export function latestShipment(order: LiveOrder): LiveShipment | null {
  return (order.shipments ?? [])[0] ?? null;
}

export function paymentSummary(order: LiveOrder): LivePayment | null {
  return (
    (order.payments ?? []).find((payment) => payment.status === "captured") ??
    (order.payments ?? [])[0] ??
    null
  );
}

export function preorderDeposit(preorder: LivePreorder): LivePayment | null {
  return (
    (preorder.payments ?? []).find((payment) => payment.kind === "deposit") ??
    (preorder.payments ?? [])[0] ??
    null
  );
}

export function orderTimeline(order: LiveOrder): TimelineItem[] {
  const payment = paymentSummary(order);
  const shipment = latestShipment(order);
  const cancelled = ["cancelled", "refunded"].includes(order.status);
  const paid = ["paid", "packing", "shipped", "delivered"].includes(order.status);
  const packing = ["packing", "shipped", "delivered"].includes(order.status);
  const shipped = ["shipped", "delivered"].includes(order.status);
  const delivered = order.status === "delivered";

  return [
    { label: "Created", date: formatDate(order.created_at), state: "complete" },
    {
      label: cancelled ? "Payment stopped" : "Payment",
      date: formatDate(payment?.captured_at ?? payment?.created_at ?? order.placed_at),
      state: cancelled ? "error" : paid ? "complete" : "current",
    },
    {
      label: "Packing",
      date: packing ? formatDate(order.updated_at) : "Pending",
      state: cancelled ? "upcoming" : packing ? "complete" : paid ? "current" : "upcoming",
    },
    {
      label: "Shipped",
      date: formatDate(shipment?.shipped_at),
      state: shipped ? (delivered ? "complete" : "current") : "upcoming",
    },
    {
      label: "Delivered",
      date: formatDate(shipment?.delivered_at),
      state: delivered ? "complete" : "upcoming",
    },
  ];
}

export function preorderTimeline(preorder: LivePreorder): TimelineItem[] {
  const deposit = preorderDeposit(preorder);
  const cancelled = ["cancelled", "refunded"].includes(preorder.status);
  const deposited = ["deposited", "allocated", "balance_due", "paid", "converted"].includes(
    preorder.status
  );
  const allocated = ["allocated", "balance_due", "paid", "converted"].includes(preorder.status);
  const balancePaid = ["paid", "converted"].includes(preorder.status);
  const converted = preorder.status === "converted";

  return [
    {
      label: cancelled ? "Deposit stopped" : "Deposit",
      date: formatDate(deposit?.captured_at ?? deposit?.created_at ?? preorder.created_at),
      state: cancelled ? "error" : deposited ? "complete" : "current",
    },
    {
      label: "Allocated",
      date: allocated ? formatDate(preorder.updated_at) : "Pending",
      state: allocated ? "complete" : deposited ? "current" : "upcoming",
    },
    {
      label: "Balance",
      date: balancePaid ? formatDate(preorder.updated_at) : "Pending",
      state: balancePaid ? "complete" : preorder.status === "balance_due" ? "current" : "upcoming",
    },
    {
      label: "Converted",
      date: converted ? formatDate(preorder.updated_at) : "Pending",
      state: converted ? "complete" : "upcoming",
    },
  ];
}

function productForSku(skuValue: MaybeArray<SkuRelation>): ProductRelation | null {
  const sku = one(skuValue);
  const variant = one(sku?.product_variants);
  return one(variant?.products);
}

function one<T>(value: MaybeArray<T>): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}
