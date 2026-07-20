import Link from "next/link";

import { MetricCard } from "@/app/_components/metric-card";
import { PageHeader } from "@/app/_components/page-header";
import { StatusBadge } from "@/app/_components/status-badge";
import { hasControlPermission, requireControlPermission } from "@/lib/control-access";
import { formatMoney } from "@/lib/money";
import { listAdminOrders, listAdminPreorders } from "@/lib/orders";
import { createServiceClient } from "@/lib/supabase";
import { toOne } from "@/lib/supabase-relations";

export const dynamic = "force-dynamic";

export default async function ControlOrdersPage() {
  const { staff } = await requireControlPermission("orders.view", "/control/orders");
  const supabase = createServiceClient();
  const [orders, preorders] = await Promise.all([
    listAdminOrders(supabase, 100),
    listAdminPreorders(supabase, 100),
  ]);
  const allocationCount = preorders.filter((preorder) =>
    ["paid", "deposited"].includes(preorder.status)
  ).length;

  return (
    <div className="space-y-8">
      <PageHeader
        action={
          hasControlPermission(staff, "preorders.allocate") &&
          hasControlPermission(staff, "refunds.manage") ? (
            <Link
              className="inline-flex min-h-10 items-center rounded-md bg-zinc-950 px-4 text-sm font-semibold text-white"
              href="/control/orders/allocations"
            >
              Review allocations
            </Link>
          ) : undefined
        }
        description="Review normal orders and preorders in one commerce workspace. Payment reconciliation and shipment execution remain in their owning domains."
        eyebrow="Control"
        title="Orders"
      />
      <section className="grid gap-4 sm:grid-cols-3">
        <MetricCard label="Orders" value={String(orders.length)} detail="Latest normal orders" />
        <MetricCard
          label="Preorders"
          value={String(preorders.length)}
          detail="Latest preorder records"
        />
        <MetricCard
          label="Awaiting allocation"
          value={String(allocationCount)}
          detail="Fully paid preorder candidates"
        />
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-zinc-950">Normal orders</h2>
        <div className="grid gap-4 xl:grid-cols-2">
          {orders.map((order) => (
            <article
              className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm"
              key={order.id}
            >
              <div className="flex flex-wrap justify-between gap-3">
                <div>
                  <p className="font-semibold text-zinc-950">
                    {toOne(order.customers)?.name || toOne(order.customers)?.email || "Customer"}
                  </p>
                  <p className="mt-1 font-mono text-xs text-zinc-400">{order.id}</p>
                </div>
                <StatusBadge tone="info">{order.status}</StatusBadge>
              </div>
              <p className="mt-3 text-sm text-zinc-600">
                {formatMoney(order.total_cents, order.currency)} · {order.order_items?.length ?? 0}{" "}
                lines
              </p>
            </article>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-zinc-950">Preorders</h2>
        <div className="grid gap-4 xl:grid-cols-2">
          {preorders.map((preorder) => (
            <article
              className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm"
              key={preorder.id}
            >
              <div className="flex flex-wrap justify-between gap-3">
                <p className="font-semibold text-zinc-950">
                  {toOne(preorder.customers)?.name ||
                    toOne(preorder.customers)?.email ||
                    "Customer"}
                </p>
                <StatusBadge tone="info">{preorder.status}</StatusBadge>
              </div>
              <p className="mt-2 font-mono text-xs text-zinc-400">{preorder.id}</p>
              <p className="mt-3 text-sm text-zinc-600">
                {preorder.quantity} requested · {preorder.allocated_qty} allocated ·{" "}
                {formatMoney(preorder.quantity * preorder.unit_price_cents, preorder.currency)}
              </p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
