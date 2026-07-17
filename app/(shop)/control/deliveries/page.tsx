import { MetricCard } from "@/app/_components/metric-card";
import { PageHeader } from "@/app/_components/page-header";
import { StatusBadge } from "@/app/_components/status-badge";
import {
  arrangeDelivery,
  markDeliveryPacking,
  updateDeliveryStatus,
} from "@/app/actions/deliveries";
import { requireControlPermission } from "@/lib/control-access";
import {
  deliveryStatuses,
  listAdminDeliveryOrders,
  type AdminDeliveryOrder,
  type AdminDeliveryShipment,
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
        description="Arrange delivery only after the full order value is captured, then maintain shipment progress manually."
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

      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-zinc-950">Fully paid orders</h2>
          <span className="text-sm text-zinc-500">{visibleOrders.length} results</span>
        </div>

        {visibleOrders.length === 0 ? (
          <p className="rounded-xl border border-dashed border-zinc-300 bg-white p-8 text-sm text-zinc-600">
            No delivery orders match this filter.
          </p>
        ) : (
          <div className="grid gap-5 xl:grid-cols-2">
            {visibleOrders.map((order) => (
              <DeliveryCard key={order.id} order={order} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function DeliveryCard({ order }: { order: AdminDeliveryOrder }) {
  const shipment = order.latestShipment;
  const address = order.shippingAddress ?? {};
  const canArrange =
    !shipment || ["pending", "label_created", "returned", "lost"].includes(shipment.status);

  return (
    <article className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="font-semibold text-zinc-950">
            {order.customer?.name || "Customer"}
          </h3>
          <p className="mt-1 break-all text-sm text-zinc-600">{order.customer?.email ?? "Unknown email"}</p>
          <p className="mt-1 break-all text-xs text-zinc-400">{order.id}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <StatusBadge tone={orderTone(order.status)}>{formatStatus(order.status)}</StatusBadge>
          <StatusBadge tone={shipmentTone(shipment?.status)}>
            {shipment ? formatStatus(shipment.status) : "Ready"}
          </StatusBadge>
        </div>
      </div>

      <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
        <Data label="Order total" value={formatMoney(order.totalCents, order.currency)} />
        <Data label="Captured" value={formatMoney(order.capturedCents, order.currency)} />
        <Data label="Items" value={String(order.items.reduce((sum, item) => sum + item.quantity, 0))} />
        <Data label="Placed" value={formatDate(order.placedAt ?? order.createdAt)} />
        <Data label="Shipping service" value={order.shippingService ?? "Not assigned"} />
        <Data label="Address" value={addressSummary(address)} />
      </dl>

      <div className="mt-5 grid gap-2 rounded-lg border border-zinc-100 bg-zinc-50 p-4 text-sm">
        {order.items.map((item) => (
          <div className="flex justify-between gap-4" key={item.id}>
            <span className="text-zinc-700">{item.productName}</span>
            <span className="shrink-0 font-medium text-zinc-950">{item.quantity} × {item.sku ?? "SKU"}</span>
          </div>
        ))}
      </div>

      {shipment ? <ShipmentSummary shipment={shipment} /> : null}

      <div className="mt-5 grid gap-4">
        {order.status === "paid" ? (
          <form action={markDeliveryPacking}>
            <input name="orderId" type="hidden" value={order.id} />
            <SecondaryButton>Mark packing</SecondaryButton>
          </form>
        ) : null}

        {canArrange ? (
          <form action={arrangeDelivery} className="grid gap-3 rounded-lg border border-zinc-200 p-4">
            <input name="orderId" type="hidden" value={order.id} />
            <h4 className="font-semibold text-zinc-950">
              {shipment && ["pending", "label_created"].includes(shipment.status)
                ? "Update delivery arrangement"
                : "Arrange delivery"}
            </h4>
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField
                label="Carrier"
                name="carrier"
                required
                value={shipment?.carrier ?? order.shippingService ?? ""}
              />
              <TextField
                label="Tracking number"
                name="trackingNumber"
                value={shipment?.trackingNumber ?? ""}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField label="Recipient" name="recipientName" required value={addressValue(address, "recipientName")} />
              <TextField label="Phone" name="phone" value={addressValue(address, "phone")} />
            </div>
            <TextField label="Address line 1" name="line1" required value={addressValue(address, "line1")} />
            <TextField label="Address line 2" name="line2" value={addressValue(address, "line2")} />
            <div className="grid gap-3 sm:grid-cols-3">
              <TextField label="City" name="city" value={addressValue(address, "city")} />
              <TextField label="State" name="state" value={addressValue(address, "state")} />
              <TextField label="Postal code" name="postalCode" required value={addressValue(address, "postalCode")} />
            </div>
            <TextField
              label="Country code"
              name="countryCode"
              required
              value={addressValue(address, "countryCode") || "SG"}
            />
            <PrimaryButton>Save arrangement</PrimaryButton>
          </form>
        ) : null}

        {shipment ? (
          <form action={updateDeliveryStatus} className="grid gap-3 rounded-lg border border-zinc-200 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
            <input name="orderId" type="hidden" value={order.id} />
            <input name="shipmentId" type="hidden" value={shipment.id} />
            <label className="grid gap-1 text-sm font-medium text-zinc-700">
              Manual delivery status
              <select className="min-h-11 rounded-md border border-zinc-300 px-3" defaultValue={shipment.status} name="status">
                {deliveryStatuses.map((status) => (
                  <option key={status} value={status}>{formatStatus(status)}</option>
                ))}
              </select>
            </label>
            <PrimaryButton>Update status</PrimaryButton>
          </form>
        ) : null}
      </div>
    </article>
  );
}

function ShipmentSummary({ shipment }: { shipment: AdminDeliveryShipment }) {
  return (
    <dl className="mt-5 grid gap-3 rounded-lg border border-emerald-100 bg-emerald-50 p-4 text-sm sm:grid-cols-2">
      <Data label="Carrier" value={shipment.carrier ?? "Not assigned"} />
      <Data label="Tracking" value={shipment.trackingNumber ?? "Pending"} />
      <Data label="Shipped" value={formatDate(shipment.shippedAt)} />
      <Data label="Delivered" value={formatDate(shipment.deliveredAt)} />
    </dl>
  );
}

function TextField({
  label,
  name,
  value,
  required = false,
}: {
  label: string;
  name: string;
  value: string;
  required?: boolean;
}) {
  return (
    <label className="grid gap-1 text-sm font-medium text-zinc-700">
      {label}
      <input
        className="min-h-11 rounded-md border border-zinc-300 px-3"
        defaultValue={value}
        name={name}
        required={required}
      />
    </label>
  );
}

function Data({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">{label}</dt>
      <dd className="mt-1 font-medium text-zinc-900">{value}</dd>
    </div>
  );
}

function PrimaryButton({ children }: { children: React.ReactNode }) {
  return (
    <button className="min-h-11 rounded-md bg-zinc-950 px-4 text-sm font-semibold text-white hover:bg-emerald-700">
      {children}
    </button>
  );
}

function SecondaryButton({ children }: { children: React.ReactNode }) {
  return (
    <button className="min-h-11 rounded-md border border-zinc-300 px-4 text-sm font-semibold text-zinc-800 hover:border-emerald-600 hover:text-emerald-700">
      {children}
    </button>
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

function addressValue(address: Record<string, unknown>, key: string): string {
  const value = address[key];
  return typeof value === "string" ? value : "";
}

function addressSummary(address: Record<string, unknown>): string {
  const parts = [
    addressValue(address, "line1"),
    addressValue(address, "postalCode"),
    addressValue(address, "countryCode"),
  ].filter(Boolean);
  return parts.length ? parts.join(", ") : "Address required";
}
