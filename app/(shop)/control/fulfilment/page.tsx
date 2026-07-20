import Link from "next/link";

import { MetricCard } from "@/app/_components/metric-card";
import { PageHeader } from "@/app/_components/page-header";
import { StatusBadge } from "@/app/_components/status-badge";
import { hasControlPermission, requireControlPermission } from "@/lib/control-access";
import { listAdminDeliveryOrders } from "@/lib/deliveries";
import { createServiceClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function ControlFulfilmentPage() {
  const { staff } = await requireControlPermission("fulfilment.view", "/control/fulfilment");
  const orders = await listAdminDeliveryOrders(createServiceClient());
  const ready = orders.filter((order) => !order.latestShipment).length;
  const inTransit = orders.filter((order) => order.latestShipment?.status === "in_transit").length;
  const exceptions = orders.filter((order) =>
    ["returned", "lost"].includes(order.latestShipment?.status ?? "")
  ).length;

  return (
    <div className="space-y-8">
      <PageHeader
        description="Own packing, shipment arrangement, carrier progress, and delivery exceptions after Orders confirms the commercial lifecycle."
        eyebrow="Control"
        title="Fulfilment"
      />
      <section className="grid gap-4 sm:grid-cols-3">
        <MetricCard label="Ready" value={String(ready)} detail="Paid orders without shipment" />
        <MetricCard label="In transit" value={String(inTransit)} detail="With carrier" />
        <MetricCard label="Exceptions" value={String(exceptions)} detail="Returned or lost" />
      </section>
      <Link
        className="block rounded-xl border border-zinc-200 bg-white p-5 shadow-sm transition hover:border-emerald-500 hover:shadow-md"
        href="/control/fulfilment/deliveries"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold text-zinc-950">Delivery control centre</h2>
            <p className="mt-2 text-sm leading-6 text-zinc-600">
              Review the queue and open a paid order to manage shipment progress.
            </p>
          </div>
          <StatusBadge tone="info">
            {hasControlPermission(staff, "fulfilment.manage") ? "Manage" : "Review"}
          </StatusBadge>
        </div>
      </Link>
    </div>
  );
}
