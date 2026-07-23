import Link from "next/link";
import { redirect } from "next/navigation";

import {
  ControlData,
  ControlEmptyState,
} from "@/app/(shop)/control/_components/control-resource-ui";
import { MetricCard } from "@/app/_components/metric-card";
import { PageHeader } from "@/app/_components/page-header";
import { StatusBadge } from "@/app/_components/status-badge";
import { requireControlPermission } from "@/lib/control-access";
import {
  deliveryNextAction,
  deliveryQueueState,
  matchesDeliverySearch,
  parseDeliveryQueueFilter,
  parseDeliveryQueueSort,
  sortDeliveryOrders,
  type DeliveryQueueFilter,
  type DeliveryQueueSort,
} from "@/lib/control-delivery-view";
import {
  listAdminDeliveryOrders,
  type AdminDeliveryOrder,
  type DeliveryStatus,
} from "@/lib/deliveries";
import { formatMoney } from "@/lib/money";
import { formatDate, formatStatus } from "@/lib/order-display";
import { createSecretClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 24;

interface DeliverySearchParams {
  q?: string;
  status?: string;
  sort?: string;
  page?: string;
}

export default async function ControlDeliveriesPage({
  searchParams,
}: {
  searchParams?: Promise<DeliverySearchParams>;
}) {
  const { staff } = await requireControlPermission(
    "fulfilment.view",
    "/control/fulfilment/deliveries"
  );
  const params = (await searchParams) ?? {};
  const query = (params.q ?? "").trim().slice(0, 160);
  const filter = parseDeliveryQueueFilter(params.status);
  const sort = parseDeliveryQueueSort(params.sort);
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const orders = await listAdminDeliveryOrders(createSecretClient());
  const counts = countStates(orders);
  const matchingOrders = sortDeliveryOrders(
    orders.filter(
      (order) =>
        (filter === "all" || deliveryQueueState(order) === filter) &&
        matchesDeliverySearch(order, query)
    ),
    sort
  );
  const totalPages = Math.max(1, Math.ceil(matchingOrders.length / PAGE_SIZE));
  const normalizedFilters = { query, filter, sort };
  if (page > totalPages) redirect(deliveryPageHref(normalizedFilters, totalPages));
  const visibleOrders = matchingOrders.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const hasActiveFilters = Boolean(query) || filter !== "all" || sort !== "action";

  return (
    <div className="space-y-8">
      <PageHeader
        action={<StatusBadge tone="success">{staff.role}</StatusBadge>}
        description="Find a fully paid order by customer, order, product, or tracking reference, then verify exact delivery state before acting."
        eyebrow="Control"
        title="Deliveries"
      />

      {counts.exceptions > 0 ? (
        <section
          aria-labelledby="delivery-exceptions-title"
          className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-rose-200 bg-rose-50 p-5"
        >
          <div>
            <h2 className="font-semibold text-rose-950" id="delivery-exceptions-title">
              {counts.exceptions} delivery exception{counts.exceptions === 1 ? "" : "s"} require
              review
            </h2>
            <p className="mt-1 text-sm leading-6 text-rose-900">
              Returned and lost shipments are separated from orders that are ready to arrange.
            </p>
          </div>
          <Link
            className="inline-flex min-h-11 items-center rounded-md border border-rose-300 bg-white px-4 text-sm font-semibold text-rose-950 hover:border-rose-500"
            href="/control/fulfilment/deliveries?status=exceptions"
          >
            Review exceptions
          </Link>
        </section>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard
          label="Exceptions"
          value={String(counts.exceptions)}
          detail="Returned or lost"
        />
        <MetricCard
          label="Ready to arrange"
          value={String(counts.ready)}
          detail="No shipment record"
        />
        <MetricCard
          label="Arranged"
          value={String(counts.arranged)}
          detail="Pending pickup or label created"
        />
        <MetricCard label="In transit" value={String(counts.in_transit)} detail="With carrier" />
        <MetricCard label="Delivered" value={String(counts.delivered)} detail="Completed records" />
      </section>

      <form className="grid gap-3 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm lg:grid-cols-[minmax(0,1fr)_14rem_14rem_auto]">
        <label className="grid gap-1 text-sm font-medium text-zinc-700">
          Search deliveries
          <input
            className="min-h-11 rounded-md border border-zinc-300 px-3 text-base sm:text-sm"
            defaultValue={query}
            maxLength={160}
            name="q"
            placeholder="Customer, order ID, product, reference, or tracking"
          />
        </label>
        <label className="grid gap-1 text-sm font-medium text-zinc-700">
          Delivery queue
          <select
            className="min-h-11 rounded-md border border-zinc-300 px-3 text-base sm:text-sm"
            defaultValue={filter}
            name="status"
          >
            <option value="all">All fully paid orders</option>
            <option value="exceptions">Exceptions</option>
            <option value="ready">Ready to arrange</option>
            <option value="arranged">Arranged</option>
            <option value="in_transit">In transit</option>
            <option value="delivered">Delivered</option>
          </select>
        </label>
        <label className="grid gap-1 text-sm font-medium text-zinc-700">
          Sort
          <select
            className="min-h-11 rounded-md border border-zinc-300 px-3 text-base sm:text-sm"
            defaultValue={sort}
            name="sort"
          >
            <option value="action">Action required first</option>
            <option value="updated_desc">Recently updated</option>
            <option value="oldest">Oldest activity first</option>
            <option value="customer">Customer name</option>
          </select>
        </label>
        <button className="min-h-11 self-end rounded-md bg-zinc-950 px-5 text-sm font-semibold text-white hover:bg-emerald-700">
          Apply
        </button>
      </form>

      {hasActiveFilters ? (
        <aside
          aria-label="Active delivery filters"
          className="flex flex-wrap items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-950"
        >
          <span className="font-semibold">Active filters:</span>
          {query ? <FilterChip>Search: “{query}”</FilterChip> : null}
          {filter !== "all" ? <FilterChip>Queue: {filterLabel(filter)}</FilterChip> : null}
          {sort !== "action" ? <FilterChip>Sort: {sortLabel(sort)}</FilterChip> : null}
          <Link className="ml-auto font-semibold underline" href="/control/fulfilment/deliveries">
            Clear all
          </Link>
        </aside>
      ) : null}

      {visibleOrders.length === 0 ? (
        <ControlEmptyState
          action={
            hasActiveFilters ? (
              <Link
                className="font-semibold text-emerald-700 hover:text-emerald-800"
                href="/control/fulfilment/deliveries"
              >
                Clear filters
              </Link>
            ) : undefined
          }
          description="Broaden the delivery search or clear one of the active filters."
          title="No delivery orders match this view"
        />
      ) : (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-zinc-950">Fully paid orders</h2>
              <p className="mt-1 text-sm text-zinc-600">
                Human-readable states lead; exact order, customer, shipment, and tracking references
                remain available for support correlation.
              </p>
            </div>
            <span className="text-sm text-zinc-500">
              {matchingOrders.length} result{matchingOrders.length === 1 ? "" : "s"} · page {page}
              of {totalPages}
            </span>
          </div>
          <div className="grid gap-5 xl:grid-cols-2">
            {visibleOrders.map((order) => (
              <DeliverySummaryCard key={order.id} order={order} />
            ))}
          </div>
        </section>
      )}

      {totalPages > 1 ? (
        <nav aria-label="Delivery pages" className="flex items-center justify-between gap-3">
          <PaginationLink disabled={page <= 1} href={deliveryPageHref(normalizedFilters, page - 1)}>
            Previous
          </PaginationLink>
          <span className="text-sm text-zinc-500">
            Page {page} of {totalPages}
          </span>
          <PaginationLink
            disabled={page >= totalPages}
            href={deliveryPageHref(normalizedFilters, page + 1)}
          >
            Next
          </PaginationLink>
        </nav>
      ) : null}
    </div>
  );
}

function DeliverySummaryCard({ order }: { order: AdminDeliveryOrder }) {
  const shipment = order.latestShipment;
  const itemQuantity = order.items.reduce((sum, item) => sum + item.quantity, 0);
  return (
    <Link
      className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm transition hover:border-emerald-500 hover:shadow-md"
      href={`/control/fulfilment/deliveries/${order.id}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="font-semibold text-zinc-950">{order.customer?.name || "Customer"}</h3>
          <p className="mt-1 break-all text-sm text-zinc-600">
            {order.customer?.email ?? "Unknown email"}
          </p>
          <dl className="mt-3 grid gap-1 text-xs text-zinc-500">
            <Identifier label="Order ID" value={order.id} />
            <Identifier label="Customer ID" value={order.customer?.id ?? "Not linked"} />
            {shipment ? <Identifier label="Shipment ID" value={shipment.id} /> : null}
            {shipment?.trackingNumber ? (
              <Identifier label="Tracking number" value={shipment.trackingNumber} />
            ) : null}
          </dl>
        </div>
        <div className="grid justify-items-end gap-2">
          <StatusBadge tone={orderTone(order.status)}>{formatStatus(order.status)}</StatusBadge>
          <StatusBadge tone={shipmentTone(shipment?.status)}>
            {shipment ? formatStatus(shipment.status) : "Ready to arrange"}
          </StatusBadge>
          <p className="font-mono text-xs text-zinc-400">
            System: {order.status} · {shipment?.status ?? "no_shipment"}
          </p>
        </div>
      </div>
      <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-4">
        <ControlData label="Order total" value={formatMoney(order.totalCents, order.currency)} />
        <ControlData label="Items" value={`${itemQuantity} across ${order.items.length} lines`} />
        <ControlData label="Placed" value={formatDate(order.placedAt ?? order.createdAt)} />
        <ControlData label="Next step" value={`${deliveryNextAction(order)} →`} />
      </dl>
    </Link>
  );
}

function Identifier({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="inline font-medium">{label} </dt>
      <dd className="inline select-all break-all font-mono">{value}</dd>
    </div>
  );
}

function FilterChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-emerald-300 bg-white px-3 py-1">{children}</span>
  );
}

function PaginationLink({
  href,
  disabled,
  children,
}: {
  href: string;
  disabled: boolean;
  children: React.ReactNode;
}) {
  if (disabled) {
    return (
      <span className="rounded-md border border-zinc-200 px-4 py-2 text-sm text-zinc-400">
        {children}
      </span>
    );
  }
  return (
    <Link
      className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-700 hover:border-emerald-600 hover:text-emerald-700"
      href={href}
    >
      {children}
    </Link>
  );
}

function deliveryPageHref(
  filters: { query: string; filter: DeliveryQueueFilter; sort: DeliveryQueueSort },
  page: number
): string {
  const search = new URLSearchParams();
  if (filters.query) search.set("q", filters.query);
  if (filters.filter !== "all") search.set("status", filters.filter);
  if (filters.sort !== "action") search.set("sort", filters.sort);
  if (page > 1) search.set("page", String(page));
  const value = search.toString();
  return value ? `/control/fulfilment/deliveries?${value}` : "/control/fulfilment/deliveries";
}

function countStates(orders: AdminDeliveryOrder[]) {
  return orders.reduce(
    (counts, order) => {
      counts[deliveryQueueState(order)] += 1;
      return counts;
    },
    { exceptions: 0, ready: 0, arranged: 0, in_transit: 0, delivered: 0 }
  );
}

function filterLabel(filter: DeliveryQueueFilter): string {
  return {
    all: "All fully paid orders",
    exceptions: "Exceptions",
    ready: "Ready to arrange",
    arranged: "Arranged",
    in_transit: "In transit",
    delivered: "Delivered",
  }[filter];
}

function sortLabel(sort: DeliveryQueueSort): string {
  return {
    action: "Action required first",
    updated_desc: "Recently updated",
    oldest: "Oldest activity first",
    customer: "Customer name",
  }[sort];
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
