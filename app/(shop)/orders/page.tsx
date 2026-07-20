import Link from "next/link";

import { PageHeader } from "@/app/_components/page-header";
import { StatusBadge } from "@/app/_components/status-badge";
import { Timeline } from "@/app/_components/timeline";
import { requireCustomer } from "@/lib/auth";
import { formatMoney } from "@/lib/money";
import {
  formatDate,
  formatStatus,
  latestShipment,
  orderItemCount,
  orderTimeline,
  preorderStatusLabel,
  preorderStatusMessage,
  preorderTimeline,
  productHrefForItem,
  productNameForItem,
  type LiveOrder,
  type LivePreorder,
} from "@/lib/order-display";
import { listCustomerOrders, listCustomerPreorders } from "@/lib/orders";
import { createServiceClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function OrdersPage({
  searchParams,
}: {
  searchParams?: Promise<{ checkout?: string }>;
}) {
  const params = (await searchParams) ?? {};
  const { customer } = await requireCustomer("/orders");
  const supabase = createServiceClient();
  let orders: LiveOrder[] = [];
  let preorders: LivePreorder[] = [];
  let ordersError = false;
  let preordersError = false;

  const [ordersResult, preordersResult] = await Promise.allSettled([
    listCustomerOrders(supabase, customer, 50),
    listCustomerPreorders(supabase, customer, 50),
  ]);

  if (ordersResult.status === "fulfilled") {
    orders = ordersResult.value as LiveOrder[];
  } else {
    ordersError = true;
    console.error("orders page query failed:", safeError(ordersResult.reason));
  }

  if (preordersResult.status === "fulfilled") {
    preorders = preordersResult.value as LivePreorder[];
  } else {
    preordersError = true;
    console.error("preorders section query failed:", safeError(preordersResult.reason));
  }

  return (
    <div className="space-y-8">
      <PageHeader
        description="Track regular orders and pre-orders from one place, including payment, allocation, refunds, fulfilment, and delivery."
        eyebrow="Orders"
        title="Your purchases"
      />

      <nav
        aria-label="Purchase history sections"
        className="grid gap-2 rounded-lg border border-zinc-200 bg-white p-2 shadow-sm sm:inline-flex"
      >
        <SectionLink href="#orders">Orders</SectionLink>
        <SectionLink href="#preorders">Pre-orders</SectionLink>
      </nav>

      {params.checkout === "processing" ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Payment is processing. Your pre-order will appear after Stripe confirms it.
        </div>
      ) : null}

      <section className="scroll-mt-28 space-y-5" id="orders">
        <SectionHeading
          description="Paid purchases that are being prepared, shipped, or delivered."
          title="Orders"
        />

        {ordersError ? (
          <ErrorNotice>Orders could not be loaded right now.</ErrorNotice>
        ) : orders.length === 0 ? (
          <EmptyState
            description="Orders appear here after checkout starts."
            title="No orders yet"
          />
        ) : (
          <div className="grid gap-5">
            {orders.map((order) => {
              const shipment = latestShipment(order);
              return (
                <article
                  className="grid gap-5 rounded-lg border border-zinc-200 bg-white p-5 shadow-sm lg:grid-cols-[1fr_18rem]"
                  key={order.id}
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-3">
                      <h3 className="text-xl font-semibold text-zinc-950">
                        Order {orderReference(order.id)}
                      </h3>
                      <StatusBadge tone={orderTone(order.status)}>
                        {formatStatus(order.status)}
                      </StatusBadge>
                    </div>
                    <p className="mt-2 text-sm text-zinc-500">
                      Placed {formatDate(order.placed_at ?? order.created_at)} ·{" "}
                      {orderItemCount(order)} item(s)
                    </p>
                    <div className="mt-5 grid gap-3">
                      {(order.order_items ?? []).slice(0, 3).map((line) => (
                        <div
                          className="flex justify-between gap-4"
                          key={line.id ?? `${order.id}-${line.sku_id}`}
                        >
                          <span className="text-sm text-zinc-700">{productNameForItem(line)}</span>
                          <span className="text-sm font-semibold text-zinc-950">
                            ×{line.quantity}
                          </span>
                        </div>
                      ))}
                    </div>
                    <div className="mt-5 flex flex-wrap gap-2">
                      <Link
                        className="inline-flex min-h-10 items-center justify-center rounded-md bg-zinc-950 px-4 text-sm font-semibold text-white hover:bg-emerald-700"
                        href={`/orders/${order.id}`}
                      >
                        View order
                      </Link>
                      {shipment?.tracking_number ? (
                        <span className="inline-flex min-h-10 items-center rounded-md border border-zinc-300 px-4 text-sm font-medium text-zinc-700">
                          {shipment.carrier ?? "Carrier"}: {shipment.tracking_number}
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <div className="rounded-md bg-zinc-50 p-4">
                    <p className="text-sm text-zinc-500">Total</p>
                    <p className="mt-1 text-2xl font-bold text-zinc-950">
                      {formatMoney(order.total_cents, order.currency)}
                    </p>
                    <div className="mt-5">
                      <Timeline items={orderTimeline(order)} />
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="scroll-mt-28 space-y-5 border-t border-zinc-200 pt-8" id="preorders">
        <SectionHeading
          description="Pre-orders are paid in full. Confirmed allocation and any shortfall refund appear here."
          title="Pre-orders"
        />

        {preordersError ? (
          <ErrorNotice>Pre-orders could not be loaded right now.</ErrorNotice>
        ) : preorders.length === 0 ? (
          <EmptyState
            description="Fully paid pre-orders appear here after Stripe confirms payment."
            title="No pre-orders yet"
          />
        ) : (
          <div className="grid gap-5">
            {preorders.map((preorder) => {
              const href = productHrefForItem(preorder);
              const refundCents = Number(preorder.allocation_refund_cents ?? 0);

              return (
                <article
                  className="grid gap-5 rounded-lg border border-zinc-200 bg-white p-5 shadow-sm lg:grid-cols-[1fr_18rem]"
                  key={preorder.id}
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-3">
                      <h3 className="text-xl font-semibold text-zinc-950">
                        {productNameForItem(preorder)}
                      </h3>
                      <StatusBadge tone={preorderTone(preorder.status)}>
                        {preorderStatusLabel(preorder.status)}
                      </StatusBadge>
                    </div>
                    <p className="mt-2 text-sm text-zinc-500">
                      Pre-ordered {formatDate(preorder.created_at)} · Quantity {preorder.quantity}
                    </p>
                    <p className="mt-4 text-sm leading-6 text-zinc-700">
                      {preorderStatusMessage(preorder)}
                    </p>
                    <dl className="mt-5 grid gap-4 sm:grid-cols-4">
                      <Value label="Requested" value={String(preorder.quantity)} />
                      <Value
                        label="Confirmed"
                        value={
                          ["allocated", "refund_pending", "converted", "refunded"].includes(
                            preorder.status
                          )
                            ? String(preorder.allocated_qty)
                            : "Pending"
                        }
                      />
                      <Value
                        label="Paid total"
                        value={formatMoney(preorder.deposit_cents, preorder.currency)}
                      />
                      <Value
                        label={refundCents > 0 ? "Allocation refund" : "Refund"}
                        value={
                          refundCents > 0
                            ? formatMoney(refundCents, preorder.currency)
                            : "Not required"
                        }
                        warning={refundCents > 0 && preorder.status === "refund_pending"}
                      />
                    </dl>
                    {refundCents > 0 ? (
                      <p className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
                        {preorder.status === "refund_pending"
                          ? "Stripe is processing the refund for the unallocated quantity."
                          : "The unallocated amount was submitted to Stripe for refund when allocation was confirmed."}
                      </p>
                    ) : null}
                    <div className="mt-5 flex flex-wrap gap-2">
                      <Link
                        className="inline-flex min-h-10 items-center justify-center rounded-md border border-zinc-300 px-4 text-sm font-semibold text-zinc-800 hover:border-zinc-500"
                        href={href ?? "/products"}
                      >
                        View product
                      </Link>
                      {preorder.order_id ? (
                        <Link
                          className="inline-flex min-h-10 items-center justify-center rounded-md border border-emerald-200 px-4 text-sm font-semibold text-emerald-800 hover:border-emerald-500"
                          href={`/orders/${preorder.order_id}`}
                        >
                          View allocated order
                        </Link>
                      ) : null}
                    </div>
                  </div>
                  <div className="rounded-md bg-zinc-50 p-4">
                    <Timeline items={preorderTimeline(preorder)} />
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function SectionLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      className="inline-flex min-h-10 items-center justify-center rounded-md px-4 text-sm font-semibold text-zinc-700 hover:bg-zinc-100 hover:text-zinc-950"
      href={href}
    >
      {children}
    </Link>
  );
}

function SectionHeading({ title, description }: { title: string; description: string }) {
  return (
    <div>
      <h2 className="text-2xl font-bold text-zinc-950">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-zinc-600">{description}</p>
    </div>
  );
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-8 text-center shadow-sm">
      <h3 className="text-xl font-semibold text-zinc-950">{title}</h3>
      <p className="mt-3 text-sm text-zinc-600">{description}</p>
      <Link
        className="mt-6 inline-flex min-h-11 items-center justify-center rounded-md bg-zinc-950 px-5 text-sm font-semibold text-white hover:bg-emerald-700"
        href="/products"
      >
        Browse products
      </Link>
    </div>
  );
}

function ErrorNotice({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
      {children}
    </div>
  );
}

function Value({
  label,
  value,
  warning = false,
}: {
  label: string;
  value: string;
  warning?: boolean;
}) {
  return (
    <div>
      <dt className="text-sm text-zinc-500">{label}</dt>
      <dd className={`mt-1 font-semibold ${warning ? "text-amber-800" : "text-zinc-950"}`}>
        {value}
      </dd>
    </div>
  );
}

function orderReference(id: string): string {
  return `#${id.slice(0, 8).toUpperCase()}`;
}

function orderTone(status: string) {
  if (["paid", "packing", "shipped", "delivered"].includes(status)) return "success" as const;
  if (["cancelled", "refunded"].includes(status)) return "danger" as const;
  if (status === "pending_payment") return "warning" as const;
  return "info" as const;
}

function preorderTone(status: string) {
  if (status === "refund_pending") return "warning" as const;
  if (["paid", "allocated", "converted"].includes(status)) return "success" as const;
  if (["cancelled", "refunded"].includes(status)) return "danger" as const;
  return "info" as const;
}

function safeError(error: unknown): string {
  return error instanceof Error ? error.message : "unknown";
}
