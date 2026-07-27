import Link from "next/link";
import { redirect } from "next/navigation";

import {
  ControlData,
  ControlEmptyState,
} from "@/app/(shop)/control/_components/control-resource-ui";
import { MetricCard } from "@/app/_components/metric-card";
import { PageHeader } from "@/app/_components/page-header";
import { StatusBadge } from "@/app/_components/status-badge";
import { hasControlPermission, requireControlPermission } from "@/lib/control-access";
import {
  matchesOrderSearch,
  orderNextStep,
  orderStatusLabel,
  orderWorkQueue,
  parseOrderRecordKind,
  parseOrderWorkspaceSort,
  parseOrderWorkQueue,
  sortOrderRecords,
  type ControlOrderRecord,
  type OrderRecordKind,
  type OrderWorkspaceSort,
  type OrderWorkQueue,
} from "@/lib/control-order-view";
import { formatMoney } from "@/lib/money";
import { listAdminOrders, listAdminPreorders } from "@/lib/orders";
import { createSecretClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 24;
const SOURCE_LIMIT = 100;

interface OrderSearchParams {
  q?: string;
  type?: string;
  queue?: string;
  sort?: string;
  page?: string;
}

export default async function ControlOrdersPage({
  searchParams,
}: {
  searchParams?: Promise<OrderSearchParams>;
}) {
  const { staff } = await requireControlPermission("orders.view", "/control/orders");
  const params = (await searchParams) ?? {};
  const query = (params.q ?? "").trim().slice(0, 160);
  const kind = parseOrderRecordKind(params.type);
  const queue = parseOrderWorkQueue(params.queue);
  const sort = parseOrderWorkspaceSort(params.sort);
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const supabase = createSecretClient();
  const [orders, preorders] = await Promise.all([
    listAdminOrders(supabase, SOURCE_LIMIT),
    listAdminPreorders(supabase, SOURCE_LIMIT),
  ]);
  const records = [
    ...normalizeOrders(orders as unknown as RawOrder[]),
    ...normalizePreorders(preorders as unknown as RawPreorder[]),
  ];
  const counts = countQueues(records);
  const matchingRecords = sortOrderRecords(
    records.filter(
      (record) =>
        (kind === "all" || record.kind === kind) &&
        (queue === "all" || orderWorkQueue(record) === queue) &&
        matchesOrderSearch(record, query)
    ),
    sort
  );
  const totalPages = Math.max(1, Math.ceil(matchingRecords.length / PAGE_SIZE));
  const normalizedFilters = { query, kind, queue, sort };
  if (page > totalPages) redirect(orderPageHref(normalizedFilters, totalPages));
  const visibleRecords = matchingRecords.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const hasActiveFilters = Boolean(query) || kind !== "all" || queue !== "all" || sort !== "action";
  const canAllocate =
    hasControlPermission(staff, "preorders.allocate") &&
    hasControlPermission(staff, "refunds.manage");

  return (
    <div className="space-y-8">
      <PageHeader
        action={
          canAllocate ? (
            <Link
              className="inline-flex min-h-11 items-center rounded-md bg-zinc-950 px-4 text-sm font-semibold text-white hover:bg-emerald-700"
              href="/control/orders/allocations"
            >
              Review allocations
            </Link>
          ) : undefined
        }
        description="Find orders and preorders by customer, product, internal ID, or provider reference, then verify exact commercial state before acting."
        eyebrow="Control"
        title="Orders"
      />

      {counts.allocation > 0 ? (
        <section
          aria-labelledby="allocation-attention-title"
          className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-amber-200 bg-amber-50 p-5"
        >
          <div>
            <h2 className="font-semibold text-amber-950" id="allocation-attention-title">
              {counts.allocation} preorder{counts.allocation === 1 ? "" : "s"} await allocation
              review
            </h2>
            <p className="mt-1 text-sm leading-6 text-amber-900">
              Paid or deposited records are surfaced before passive order history.
            </p>
          </div>
          {canAllocate ? (
            <Link
              className="inline-flex min-h-11 items-center rounded-md border border-amber-300 bg-white px-4 text-sm font-semibold text-amber-950 hover:border-amber-500"
              href="/control/orders/allocations"
            >
              Review allocation effects
            </Link>
          ) : (
            <StatusBadge tone="warning">Allocation team action</StatusBadge>
          )}
        </section>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard
          label="Allocation review"
          value={String(counts.allocation)}
          detail="Paid or deposited preorders"
        />
        <MetricCard
          label="Payment required"
          value={String(counts.payment)}
          detail="Orders and preorders"
        />
        <MetricCard label="Active" value={String(counts.active)} detail="In operational progress" />
        <MetricCard
          label="Completed"
          value={String(counts.completed)}
          detail="Delivered or converted"
        />
        <MetricCard label="Closed" value={String(counts.closed)} detail="Cancelled or refunded" />
      </section>
      <p className="text-xs text-zinc-500">
        Workspace scope: latest {orders.length} normal order{orders.length === 1 ? "" : "s"} and{" "}
        {preorders.length} preorder{preorders.length === 1 ? "" : "s"} (maximum {SOURCE_LIMIT} of
        each). Search, metrics, and filters apply to this bounded operational window.
      </p>

      <form className="grid gap-3 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm xl:grid-cols-[minmax(0,1fr)_11rem_13rem_13rem_auto]">
        <label className="grid gap-1 text-sm font-medium text-zinc-700">
          Search records
          <input
            className="min-h-11 rounded-md border border-zinc-300 px-3 text-base sm:text-sm"
            defaultValue={query}
            maxLength={160}
            name="q"
            placeholder="Customer, product, ID, reference, or provider reference"
          />
        </label>
        <label className="grid gap-1 text-sm font-medium text-zinc-700">
          Record type
          <select
            className="min-h-11 rounded-md border border-zinc-300 px-3 text-base sm:text-sm"
            defaultValue={kind}
            name="type"
          >
            <option value="all">All records</option>
            <option value="order">Orders</option>
            <option value="preorder">Preorders</option>
          </select>
        </label>
        <label className="grid gap-1 text-sm font-medium text-zinc-700">
          Work queue
          <select
            className="min-h-11 rounded-md border border-zinc-300 px-3 text-base sm:text-sm"
            defaultValue={queue}
            name="queue"
          >
            <option value="all">All work queues</option>
            <option value="allocation">Allocation review</option>
            <option value="payment">Payment required</option>
            <option value="active">Active progress</option>
            <option value="completed">Completed</option>
            <option value="closed">Closed</option>
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
            <option value="value_desc">Highest value first</option>
          </select>
        </label>
        <button className="min-h-11 self-end rounded-md bg-zinc-950 px-5 text-sm font-semibold text-white hover:bg-emerald-700">
          Apply
        </button>
      </form>

      {hasActiveFilters ? (
        <aside
          aria-label="Active order filters"
          className="flex flex-wrap items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-950"
        >
          <span className="font-semibold">Active filters:</span>
          {query ? <FilterChip>Search: “{query}”</FilterChip> : null}
          {kind !== "all" ? <FilterChip>Type: {kindLabel(kind)}</FilterChip> : null}
          {queue !== "all" ? <FilterChip>Queue: {queueLabel(queue)}</FilterChip> : null}
          {sort !== "action" ? <FilterChip>Sort: {sortLabel(sort)}</FilterChip> : null}
          <Link className="ml-auto font-semibold underline" href="/control/orders">
            Clear all
          </Link>
        </aside>
      ) : null}

      {visibleRecords.length === 0 ? (
        <ControlEmptyState
          action={
            hasActiveFilters ? (
              <Link className="font-semibold text-emerald-700" href="/control/orders">
                Clear filters
              </Link>
            ) : undefined
          }
          description="Broaden the record search or clear one of the active filters."
          title="No order records match this view"
        />
      ) : (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-zinc-950">Commerce records</h2>
              <p className="mt-1 text-sm text-zinc-600">
                Customer and product context lead; exact system identifiers and states remain
                available for correlation.
              </p>
            </div>
            <span className="text-sm text-zinc-500">
              {matchingRecords.length} result{matchingRecords.length === 1 ? "" : "s"} · page {page}{" "}
              of {totalPages}
            </span>
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            {visibleRecords.map((record) => (
              <OrderRecordCard key={`${record.kind}:${record.id}`} record={record} />
            ))}
          </div>
        </section>
      )}

      {totalPages > 1 ? (
        <nav aria-label="Order record pages" className="flex items-center justify-between gap-3">
          <PaginationLink disabled={page <= 1} href={orderPageHref(normalizedFilters, page - 1)}>
            Previous
          </PaginationLink>
          <span className="text-sm text-zinc-500">
            Page {page} of {totalPages}
          </span>
          <PaginationLink
            disabled={page >= totalPages}
            href={orderPageHref(normalizedFilters, page + 1)}
          >
            Next
          </PaginationLink>
        </nav>
      ) : null}
    </div>
  );
}

function OrderRecordCard({ record }: { record: ControlOrderRecord }) {
  const firstProduct = record.products[0];
  const additionalProducts = Math.max(0, record.products.length - 1);
  return (
    <Link
      className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm transition hover:border-emerald-500 hover:shadow-md"
      href={
        record.kind === "order"
          ? `/control/orders/normal/${record.id}`
          : `/control/orders/preorders/${record.id}`
      }
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="font-semibold text-zinc-950">
            {record.customer?.name || record.customer?.email || "Customer"}
          </h3>
          <p className="mt-1 break-all text-sm text-zinc-600">
            {record.customer?.email ?? "Unknown email"}
          </p>
          <p className="mt-2 text-sm text-zinc-700">
            {firstProduct?.name ?? "Product unavailable"}
            {additionalProducts > 0 ? ` +${additionalProducts} more` : ""}
          </p>
          <dl className="mt-3 grid gap-1 text-xs text-zinc-500">
            <Identifier
              label={record.kind === "order" ? "Order ID" : "Preorder ID"}
              value={record.id}
            />
            <Identifier label="Customer ID" value={record.customer?.id ?? "Not linked"} />
            {firstProduct?.referenceCode ? (
              <Identifier label="Product reference" value={firstProduct.referenceCode} />
            ) : null}
            {record.providerReferences[0] ? (
              <Identifier label="Provider reference" value={record.providerReferences[0]} />
            ) : null}
            {record.linkedOrderId ? (
              <Identifier label="Linked order ID" value={record.linkedOrderId} />
            ) : null}
          </dl>
        </div>
        <div className="grid justify-items-end gap-2">
          <StatusBadge tone={statusTone(record)}>{orderStatusLabel(record)}</StatusBadge>
          <StatusBadge tone="info">{record.kind === "order" ? "Order" : "Preorder"}</StatusBadge>
          <p className="font-mono text-xs text-zinc-400">
            System: {record.kind} · {record.status}
          </p>
        </div>
      </div>
      <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-4">
        <ControlData label="Value" value={formatMoney(record.totalCents, record.currency)} />
        <ControlData
          label="Quantity"
          value={
            record.kind === "order"
              ? `${record.quantity} across ${record.lineCount} lines`
              : `${record.allocatedQuantity ?? 0} of ${record.quantity} allocated`
          }
        />
        <ControlData label="Updated" value={formatDateTime(record.updatedAt)} />
        <ControlData label="Next step" value={`${orderNextStep(record)} →`} />
      </dl>
    </Link>
  );
}

function normalizeOrders(rows: RawOrder[]): ControlOrderRecord[] {
  return rows.map((order) => ({
    kind: "order",
    id: order.id,
    status: order.status,
    customer: one(order.customers),
    currency: order.currency,
    totalCents: Number(order.total_cents),
    quantity: (order.order_items ?? []).reduce((sum, item) => sum + Number(item.quantity), 0),
    lineCount: order.order_items?.length ?? 0,
    allocatedQuantity: null,
    createdAt: order.created_at,
    updatedAt: order.updated_at,
    products: (order.order_items ?? []).map((item) => ({
      name: one(item.products)?.name ?? "Product unavailable",
      referenceCode: one(item.products)?.reference_code ?? null,
    })),
    providerReferences: (order.payments ?? []).flatMap((payment) =>
      payment.provider_payment_id ? [payment.provider_payment_id] : []
    ),
    linkedOrderId: null,
  }));
}

function normalizePreorders(rows: RawPreorder[]): ControlOrderRecord[] {
  return rows.map((preorder) => {
    const product = one(preorder.products);
    return {
      kind: "preorder",
      id: preorder.id,
      status: preorder.status,
      customer: one(preorder.customers),
      currency: preorder.currency,
      totalCents: Number(preorder.quantity) * Number(preorder.unit_price_cents),
      quantity: Number(preorder.quantity),
      lineCount: 1,
      allocatedQuantity: Number(preorder.allocated_qty),
      createdAt: preorder.created_at,
      updatedAt: preorder.updated_at,
      products: [
        {
          name: product?.name ?? "Product unavailable",
          referenceCode: product?.reference_code ?? null,
        },
      ],
      providerReferences: (preorder.payments ?? []).flatMap((payment) =>
        payment.provider_payment_id ? [payment.provider_payment_id] : []
      ),
      linkedOrderId: preorder.order_id,
    };
  });
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
  if (disabled)
    return (
      <span className="rounded-md border border-zinc-200 px-4 py-2 text-sm text-zinc-400">
        {children}
      </span>
    );
  return (
    <Link
      className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-700 hover:border-emerald-600 hover:text-emerald-700"
      href={href}
    >
      {children}
    </Link>
  );
}

function orderPageHref(
  filters: {
    query: string;
    kind: "all" | OrderRecordKind;
    queue: OrderWorkQueue;
    sort: OrderWorkspaceSort;
  },
  page: number
): string {
  const search = new URLSearchParams();
  if (filters.query) search.set("q", filters.query);
  if (filters.kind !== "all") search.set("type", filters.kind);
  if (filters.queue !== "all") search.set("queue", filters.queue);
  if (filters.sort !== "action") search.set("sort", filters.sort);
  if (page > 1) search.set("page", String(page));
  const value = search.toString();
  return value ? `/control/orders?${value}` : "/control/orders";
}

function countQueues(records: ControlOrderRecord[]) {
  return records.reduce(
    (counts, record) => {
      counts[orderWorkQueue(record)] += 1;
      return counts;
    },
    { allocation: 0, payment: 0, active: 0, completed: 0, closed: 0 }
  );
}

function kindLabel(kind: OrderRecordKind): string {
  return kind === "order" ? "Orders" : "Preorders";
}
function queueLabel(queue: OrderWorkQueue): string {
  return {
    all: "All",
    allocation: "Allocation review",
    payment: "Payment required",
    active: "Active progress",
    completed: "Completed",
    closed: "Closed",
  }[queue];
}
function sortLabel(sort: OrderWorkspaceSort): string {
  return {
    action: "Action required first",
    updated_desc: "Recently updated",
    oldest: "Oldest activity first",
    customer: "Customer name",
    value_desc: "Highest value first",
  }[sort];
}

function statusTone(record: ControlOrderRecord) {
  const queue = orderWorkQueue(record);
  if (queue === "closed") return "danger" as const;
  if (queue === "allocation" || queue === "payment") return "warning" as const;
  if (queue === "completed") return "success" as const;
  return "info" as const;
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("en-SG", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Singapore",
  }).format(new Date(value));
}

function one<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

interface RawCustomer {
  id: string;
  email: string;
  name: string | null;
}
interface RawProduct {
  name: string;
  reference_code: string | null;
}
interface RawPayment {
  provider_payment_id: string | null;
}
interface RawOrder {
  id: string;
  status: string;
  currency: string;
  total_cents: number;
  created_at: string;
  updated_at: string;
  customers: RawCustomer | RawCustomer[] | null;
  order_items: Array<{ quantity: number; products: RawProduct | RawProduct[] | null }> | null;
  payments: RawPayment[] | null;
}
interface RawPreorder {
  id: string;
  status: string;
  currency: string;
  quantity: number;
  unit_price_cents: number;
  allocated_qty: number;
  order_id: string | null;
  created_at: string;
  updated_at: string;
  customers: RawCustomer | RawCustomer[] | null;
  products: RawProduct | RawProduct[] | null;
  payments: RawPayment[] | null;
}
