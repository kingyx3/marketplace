import Link from "next/link";

import {
  ControlData,
  ControlEmptyState,
} from "@/app/(shop)/control/_components/control-resource-ui";
import { MetricCard } from "@/app/_components/metric-card";
import { PageHeader } from "@/app/_components/page-header";
import { StatusBadge } from "@/app/_components/status-badge";
import { requireControlPermission } from "@/lib/control-access";
import {
  listAdminDeliveryOrders,
  type AdminDeliveryOrder,
  type DeliveryStatus,
} from "@/lib/deliveries";
import { formatMoney } from "@/lib/money";
import { formatDate, formatStatus } from "@/lib/order-display";
import { createServiceClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

type DeliveryFilter = "all" | "ready" | "arranged" | "in_transit" | "completed";

export default async function ControlDeliveriesPage({
  searchParams,
}: {
  searchParams?: Promise<{ status?: string }>;
}) {
  const { staff } = await requireControlPermission("manage_orders", "/control/deliveries");
  const params = (await searchParams) ?? {};
  const filter = deliveryFilter(params.status);
  const orders = await listAdminDeliveryOrders(createServiceClient());
  const visibleOrders = orders.filter((order) => matchesFilter(order, filter));
  const readyCount = orders.filter((order) => !order.latestShipment).length;
  const arrangedCount = orders.filter((order) =>
    ["pending", "label_created"].includes(order.latestShipment?.status ?? "")
  ).length;
  const inTransitCount = orders.filter(
    (order) => order.latestShipment?.status === "in_transit"
  ).length;
  const completedCount = orders.filter(
    (order) => order.latestShipment?.status === "delivered"
  ).length;

  return (
    <div className="space-y-8">
      <PageHeader
        action={<StatusBadge tone="success">{staff.role}</StatusBadge>}
        description="Review the fully paid delivery queue and open an order to arrange shipment or maintain progress."
        eyebrow="Control"
        title="Deliveries"
      />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Ready to arrange" value={String(readyCount)} detail="Fully paid orders without a shipment" />
        <MetricCard label="Arranged" value={String(arrangedCount)} detail="Pending pickup or label created" />
        <MetricCard label="In transit" value={String(inTransitCount)} detail="Shipment handed to the carrier" />
        <MetricCard label="Delivered" value={String(completedCount)} detail="Completed delivery records" />
      </section>

      <form className="flex flex-wrap items-end gap-3 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
        <label className="grid min-w-52 gap-1 text-sm font-medium text-zinc-700">
          Delivery queue
          <select
            className="min-h-11 rounded-md border border-zinc-300 px-3 text-base sm:text-sm"
            defaultValue={filter}
            name="status"
          >
            <option value="all">All fully paid orders</option>
            <option value="ready">Ready to arrange</option>
            <option value="arranged">Arranged</option>
            <option value="in_transit">In transit</option>
            <option value="completed">Completed</option>
          </select>
        </label>
        <button className="min-h-11 rounded-md bg-zinc-950 px-5 text-sm font-semibold text-white hover:bg-emerald-700">
          Filter
        </button>
      </form>

      {visibleOrders.length === 0 ? (
        <ControlEmptyState
          description="No fully paid delivery orders match the selected queue."
          title="No delivery orders match this view"
        />
      ) : (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-zinc-950">Fully paid orders</h2>
            <span className="text-sm text-zinc-500">{visibleOrders.length} results</span>
          </div>
          <div className="grid gap-5 xl:grid-cols-2">
            {visibleOrders.map((order) => (
              <DeliverySummaryCard key={order.id} order={order} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function DeliverySummaryCard({ order }: { order: AdminDeliveryOrder }) {
  const shipment = order.latestShipment;
  return (
    <Link
      className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm transition hover:border-emerald-500 hover:shadow-md"
      href={`/control/deliveries/${order.id}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="font-semibold text-zinc-950">{order.customer?.name || "Customer"}</h3>
          <p className="mt-1 break-all text-sm text-zinc-600">{order.customer?.email ?? "Unknown email"}</p>
          <p className="mt-1 break-all font-mono text-xs text-zinc-400">{order.id}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <StatusBadge tone={orderTone(order.status)}>{formatStatus(order.status)}</StatusBadge>
          <StatusBadge tone={shipmentTone(shipment?.status)}>
            {shipment ? formatStatus(shipment.status) : "Ready"}
          </StatusBadge>
        </div>
      </div>
      <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-3">
        <ControlData label="Order total" value={formatMoney(order.totalCents, order.currency)} />
        <ControlData label="Items" value={String(order.items.reduce((sum, item) => sum + item.quantity, 0))} />
        <ControlData label="Placed" value={formatDate(order.placedAt ?? order.createdAt)} />
      </dl>
    </Link>
  );
}

function deliveryFilter(value?: string): DeliveryFilter {
  return ["ready", "arranged", "in_transit", "completed"].includes(value ?? "")
    ? (value as DeliveryFilter)
    : "all";
}

function matchesFilter(order: AdminDeliveryOrder, filter: DeliveryFilter): boolean {
  const status = order.latestShipment?.status;
  if (filter === "ready") return !status || ["returned", "lost"].includes(status);
  if (filter === "arranged") return ["pending", "label_created"].includes(status ?? "");
  if (filter === "in_transit") return status === "in_transit";
  if (filter === "completed") return status === "delivered";
  return true;
}

function orderTone(status: string) {
  if (["paid", "packing", "shipped", "delivered"].includes(status)) return "success" as const;
  if (["cancelled", "refunded"].includes(status)) return "danger" as const;
  return "info" as const;
}

function shipmentTone(status?: DeliveryStatus) {
  if (status === "delivered") return "success" as const;
  if (["returned", "lost"].includes(status ?? "")) return "danger" as const;
  if (["pending", "label_created"].includes(status ?? "")) return "warning" as const;
  return "info" as const;
}
