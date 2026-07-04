import Link from "next/link";
import { PageHeader } from "@/app/_components/page-header";
import { StatusBadge } from "@/app/_components/status-badge";
import { Timeline } from "@/app/_components/timeline";
import { requireCustomer } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase";
import { listCustomerOrders } from "@/lib/orders";
import { formatMoney } from "@/lib/money";
import {
  formatDate,
  formatStatus,
  latestShipment,
  orderItemCount,
  orderTimeline,
  productNameForItem,
  type LiveOrder,
} from "@/lib/order-display";

export const dynamic = "force-dynamic";

export default async function OrdersPage() {
  const { customer } = await requireCustomer("/orders");
  const supabase = createServiceClient();
  let orders: LiveOrder[] = [];
  let dataError = false;

  try {
    orders = (await listCustomerOrders(supabase, customer, 50)) as LiveOrder[];
  } catch (error) {
    dataError = true;
    console.error("orders page query failed:", error instanceof Error ? error.message : "unknown");
  }

  return (
    <div className="space-y-8">
      <PageHeader
        description="Paid, packed, shipped, and delivered orders stay separated from preorder deposits and balance captures."
        eyebrow="Orders"
        title="Order history"
      />

      {dataError ? (
        <div className="rounded-md border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          Orders could not be loaded right now.
        </div>
      ) : null}

      <section className="grid gap-5">
        {orders.length === 0 ? (
          <div className="rounded-lg border border-zinc-200 bg-white p-8 text-center shadow-sm">
            <h2 className="text-xl font-semibold text-zinc-950">No orders yet</h2>
            <p className="mt-3 text-sm text-zinc-600">Orders appear here after checkout starts.</p>
            <Link
              className="mt-6 inline-flex min-h-11 items-center justify-center rounded-md bg-zinc-950 px-5 text-sm font-semibold text-white hover:bg-emerald-700"
              href="/catalog"
            >
              Browse catalog
            </Link>
          </div>
        ) : (
          orders.map((order) => {
            const shipment = latestShipment(order);
            return (
              <article
                className="grid gap-5 rounded-lg border border-zinc-200 bg-white p-5 shadow-sm lg:grid-cols-[1fr_18rem]"
                key={order.id}
              >
                <div>
                  <div className="flex flex-wrap items-center gap-3">
                    <h2 className="text-xl font-semibold text-zinc-950">{order.id}</h2>
                    <StatusBadge tone={orderTone(order.status)}>
                      {formatStatus(order.status)}
                    </StatusBadge>
                    <StatusBadge tone="neutral">{order.channel.toUpperCase()}</StatusBadge>
                  </div>
                  <p className="mt-2 text-sm text-zinc-500">
                    Placed {formatDate(order.placed_at ?? order.created_at)} /{" "}
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
                          x{line.quantity}
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
          })
        )}
      </section>
    </div>
  );
}

function orderTone(status: string) {
  if (["paid", "packing", "shipped", "delivered"].includes(status)) return "success" as const;
  if (["cancelled", "refunded"].includes(status)) return "danger" as const;
  if (status === "pending_payment") return "warning" as const;
  return "info" as const;
}
