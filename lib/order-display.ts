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
  shipping_address?: unknown;
  shipping_service?: string | null;
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
  allocation_refund_cents?: number | null;
  allocation_confirmed_at?: string | null;
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

export function preorderStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    pending_payment: "Payment required",
    pending_deposit: "Payment required",
    deposited: "Payment received",
    balance_due: "Payment required",
    paid: "Awaiting allocation",
    allocated: "Allocation confirmed",
    refund_pending: "Refund in progress",
    converted: "Ready in orders",
    cancelled: "Cancelled",
    refunded: "Refunded",
  };

  return labels[status] ?? "Update available";
}

export function preorderStatusMessage(preorder: LivePreorder): string {
  const allocated = Number(preorder.allocated_qty ?? 0);
  const requested = Number(preorder.quantity ?? 0);

  if (["pending_payment", "pending_deposit", "balance_due"].includes(preorder.status)) {
    return "Payment is still needed before this preorder can move forward.";
  }
  if (preorder.status === "paid" || preorder.status === "deposited") {
    return "You’re paid in full. We’ll confirm your quantity after supplier allocation.";
  }
  if (preorder.status === "refund_pending") {
    return `We confirmed ${allocated} of ${requested} and are returning the difference to your original payment method.`;
  }
  if (preorder.status === "allocated") {
    return `Your confirmed quantity is ${allocated} of ${requested}. We’ll create an order when it is ready for fulfilment.`;
  }
  if (preorder.status === "converted") {
    return "Your confirmed items have moved to Orders, where you can follow delivery progress.";
  }
  if (preorder.status === "refunded") {
    return "The amount due back has been returned to your original payment method.";
  }
  if (preorder.status === "cancelled") {
    return "This preorder will not move forward.";
  }

  return "We have an update on this preorder. Check the progress below for details.";
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
  return productForSku(item.booster_box_skus)?.name ?? "Product unavailable";
}

export function productHrefForItem(item: LiveOrderItem | LivePreorder): string | null {
  const slug = productForSku(item.booster_box_skus)?.slug;
  return slug ? `/products/${slug}` : null;
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

export function preorderPayment(preorder: LivePreorder): LivePayment | null {
  return (
    (preorder.payments ?? []).find(
      (payment) => payment.kind === "full" && payment.status === "captured"
    ) ??
    (preorder.payments ?? []).find((payment) => payment.kind === "full") ??
    (preorder.payments ?? [])[0] ??
    null
  );
}

/** @deprecated Preorders are paid in full; retained for compatible callers. */
export const preorderDeposit = preorderPayment;

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
  const payment = preorderPayment(preorder);
  const cancelled = preorder.status === "cancelled";
  const paid = ["paid", "allocated", "refund_pending", "converted", "refunded"].includes(
    preorder.status
  );
  const allocationConfirmed = ["allocated", "refund_pending", "converted", "refunded"].includes(
    preorder.status
  );
  const refundRequired = Number(preorder.allocation_refund_cents ?? 0) > 0;
  const refundComplete = preorder.status === "refunded" || preorder.status === "converted";
  const converted = preorder.status === "converted";

  return [
    {
      label: cancelled ? "Payment cancelled" : "Paid in full",
      date: formatDate(payment?.captured_at ?? payment?.created_at ?? preorder.created_at),
      state: cancelled ? "error" : paid ? "complete" : "current",
    },
    {
      label: "Allocation",
      date: allocationConfirmed
        ? formatDate(preorder.allocation_confirmed_at ?? preorder.updated_at)
        : "Pending",
      state: allocationConfirmed ? "complete" : paid ? "current" : "upcoming",
    },
    {
      label: refundRequired ? "Shortfall refund" : "Allocation confirmed",
      date: refundRequired && refundComplete ? formatDate(preorder.updated_at) : refundRequired ? "Pending" : allocationConfirmed ? "Not required" : "Pending",
      state: refundRequired
        ? refundComplete
          ? "complete"
          : preorder.status === "refund_pending"
            ? "current"
            : "upcoming"
        : allocationConfirmed
          ? "complete"
          : "upcoming",
    },
    {
      label: "Order created",
      date: converted ? formatDate(preorder.updated_at) : "Pending",
      state: converted ? "complete" : preorder.status === "refunded" ? "upcoming" : "upcoming",
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
