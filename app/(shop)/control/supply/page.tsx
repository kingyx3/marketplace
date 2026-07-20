import Link from "next/link";

import { MetricCard } from "@/app/_components/metric-card";
import { PageHeader } from "@/app/_components/page-header";
import { StatusBadge } from "@/app/_components/status-badge";
import { hasControlPermission, requireControlPermission } from "@/lib/control-access";
import { fetchControlInventory, fetchControlPurchaseOrders } from "@/lib/control-supply";
import { formatMoney } from "@/lib/money";
import { createServiceClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function ControlSupplyPage() {
  const { staff } = await requireControlPermission("supply.view", "/control/supply");
  const supabase = createServiceClient();
  const [inventory, purchaseOrders] = await Promise.all([
    fetchControlInventory(supabase),
    fetchControlPurchaseOrders(supabase),
  ]);
  const canAdjust = hasControlPermission(staff, "inventory.adjust");
  const canPurchase = hasControlPermission(staff, "purchase_orders.manage");

  return (
    <div className="space-y-8">
      <PageHeader
        action={
          <>
            <Link
              className="inline-flex min-h-10 items-center rounded-md border border-zinc-300 px-4 text-sm font-semibold text-zinc-800"
              href="/control/supply/suppliers"
            >
              Suppliers
            </Link>
            {canPurchase ? (
              <Link
                className="inline-flex min-h-10 items-center rounded-md bg-zinc-950 px-4 text-sm font-semibold text-white hover:bg-emerald-700"
                href="/control/supply/purchase-orders/new"
              >
                Create purchase order
              </Link>
            ) : null}
          </>
        }
        description="Control physical stock, incoming supply, safety stock, suppliers, and purchase orders without changing price or publication."
        eyebrow="Control"
        title="Supply"
      />
      <section className="grid gap-4 sm:grid-cols-3">
        <MetricCard
          label="On hand"
          value={String(inventory.reduce((sum, row) => sum + row.onHand, 0))}
          detail="Physical units recorded"
        />
        <MetricCard
          label="Incoming"
          value={String(inventory.reduce((sum, row) => sum + row.incoming, 0))}
          detail="Confirmed expected units"
        />
        <MetricCard
          label="Open purchase orders"
          value={String(
            purchaseOrders.filter((order) => !["completed", "cancelled"].includes(order.status))
              .length
          )}
          detail="Supply commitments"
        />
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-zinc-950">Inventory</h2>
        {inventory.map((row) => (
          <Link
            className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm transition hover:border-emerald-500 hover:shadow-md"
            href={`/control/supply/inventory/${row.skuId}`}
            key={row.skuId}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold text-zinc-950">{row.productName}</h3>
                <p className="mt-1 text-xs text-zinc-500">{row.sku}</p>
              </div>
              <StatusBadge tone={row.available > row.safetyStock ? "success" : "warning"}>
                {Math.max(0, row.available - row.safetyStock)} available to sell
              </StatusBadge>
            </div>
            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-4">
              <div>
                <dt className="text-xs text-zinc-500">On hand</dt>
                <dd className="font-semibold">{row.onHand}</dd>
              </div>
              <div>
                <dt className="text-xs text-zinc-500">Incoming</dt>
                <dd className="font-semibold">{row.incoming}</dd>
              </div>
              <div>
                <dt className="text-xs text-zinc-500">Allocated</dt>
                <dd className="font-semibold">{row.allocated}</dd>
              </div>
              <div>
                <dt className="text-xs text-zinc-500">Action</dt>
                <dd className="font-semibold text-emerald-700">
                  {canAdjust ? "Adjust stock →" : "View stock →"}
                </dd>
              </div>
            </dl>
          </Link>
        ))}
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-zinc-950">Purchase orders</h2>
          {canPurchase ? (
            <Link
              className="text-sm font-semibold text-emerald-700"
              href="/control/supply/purchase-orders/new"
            >
              Create purchase order
            </Link>
          ) : null}
        </div>
        <div className="mt-6 grid gap-3 md:grid-cols-2">
          {purchaseOrders.map((order) => (
            <Link
              className="rounded-lg border border-zinc-200 p-4 transition hover:border-emerald-500"
              href={`/control/supply/purchase-orders/${order.id}`}
              key={order.id}
            >
              <div className="flex justify-between gap-3">
                <p className="font-semibold text-zinc-950">{order.supplier}</p>
                <StatusBadge tone="info">{order.status}</StatusBadge>
              </div>
              <p className="mt-2 text-sm text-zinc-600">
                {order.boxes} units · {formatMoney(order.valueCents, order.currency)} ·{" "}
                {order.expectedAt ?? "Unscheduled"}
              </p>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
