import Link from "next/link";

import { ControlEmptyState } from "@/app/(shop)/control/_components/control-resource-ui";
import { MetricCard } from "@/app/_components/metric-card";
import { PageHeader } from "@/app/_components/page-header";
import { StatusBadge } from "@/app/_components/status-badge";
import { hasControlPermission, requireControlPermission } from "@/lib/control-access";
import { fetchControlInventory, fetchControlPurchaseOrders } from "@/lib/control-supply";
import {
  filterAndSortInventory,
  getSellableUnits,
  inventoryState,
  isOpenPurchaseOrder,
  needsInventoryAttention,
  purchaseOrderStatusLabel,
  type InventoryFilter,
  type InventorySort,
} from "@/lib/control-supply-view";
import { formatMoney } from "@/lib/money";
import { createSecretClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const INVENTORY_PAGE_SIZE = 25;

interface SupplySearchParams {
  q?: string;
  stock?: string;
  sort?: string;
  inventoryPage?: string;
}

export default async function ControlSupplyPage({
  searchParams,
}: {
  searchParams?: Promise<SupplySearchParams>;
}) {
  const { staff } = await requireControlPermission("supply.view", "/control/supply");
  const params = (await searchParams) ?? {};
  const query = (params.q ?? "").trim().slice(0, 120);
  const stockFilter = parseInventoryFilter(params.stock);
  const inventorySort = parseInventorySort(params.sort);
  const requestedPage = Math.max(1, Number.parseInt(params.inventoryPage ?? "1", 10) || 1);
  const supabase = createSecretClient();
  const [inventory, purchaseOrders] = await Promise.all([
    fetchControlInventory(supabase),
    fetchControlPurchaseOrders(supabase),
  ]);
  const filteredInventory = filterAndSortInventory(inventory, {
    query,
    filter: stockFilter,
    sort: inventorySort,
  });
  const totalPages = Math.max(1, Math.ceil(filteredInventory.length / INVENTORY_PAGE_SIZE));
  const inventoryPage = Math.min(requestedPage, totalPages);
  const visibleInventory = filteredInventory.slice(
    (inventoryPage - 1) * INVENTORY_PAGE_SIZE,
    inventoryPage * INVENTORY_PAGE_SIZE
  );
  const attentionCount = inventory.filter(needsInventoryAttention).length;
  const canAdjust = hasControlPermission(staff, "inventory.adjust");
  const canPurchase = hasControlPermission(staff, "purchase_orders.manage");
  const hasActiveFilters = Boolean(query) || stockFilter !== "all" || inventorySort !== "attention";

  return (
    <div className="space-y-8">
      <PageHeader
        action={
          <>
            <Link
              className="inline-flex min-h-11 items-center rounded-md border border-zinc-300 px-4 text-sm font-semibold text-zinc-800 hover:border-emerald-600 hover:text-emerald-700"
              href="/control/supply/suppliers"
            >
              Suppliers
            </Link>
            {canPurchase ? (
              <Link
                className="inline-flex min-h-11 items-center rounded-md bg-zinc-950 px-4 text-sm font-semibold text-white hover:bg-emerald-700"
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

      {attentionCount > 0 ? (
        <section
          aria-labelledby="supply-attention-title"
          className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-amber-300 bg-amber-50 p-5"
        >
          <div>
            <h2 className="font-semibold text-amber-950" id="supply-attention-title">
              {attentionCount} inventory record{attentionCount === 1 ? "" : "s"} require attention
            </h2>
            <p className="mt-1 text-sm leading-6 text-amber-900">
              These products have no units above safety stock. Incoming stock remains separate until it
              is received.
            </p>
          </div>
          <Link
            className="inline-flex min-h-11 items-center rounded-md border border-amber-400 bg-white px-4 text-sm font-semibold text-amber-950 hover:border-amber-600"
            href="/control/supply?stock=attention"
          >
            Review stock requiring attention
          </Link>
        </section>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="On hand"
          value={String(inventory.reduce((sum, row) => sum + row.onHand, 0))}
          detail="Physical units recorded"
        />
        <MetricCard
          label="Allocated"
          value={String(inventory.reduce((sum, row) => sum + row.allocated, 0))}
          detail="Units committed to customers"
        />
        <MetricCard
          label="Incoming"
          value={String(inventory.reduce((sum, row) => sum + row.incoming, 0))}
          detail="Confirmed expected units"
        />
        <MetricCard
          label="Open purchase orders"
          value={String(purchaseOrders.filter(isOpenPurchaseOrder).length)}
          detail="Draft through partially received"
        />
      </section>

      <form className="grid gap-3 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm lg:grid-cols-[minmax(0,1fr)_13rem_13rem_auto]">
        <label className="grid gap-1 text-sm font-medium text-zinc-700">
          Search inventory
          <input
            className="min-h-11 rounded-md border border-zinc-300 px-3 text-base sm:text-sm"
            defaultValue={query}
            maxLength={120}
            name="q"
            placeholder="Product, product, product ID, or product ID"
          />
        </label>
        <label className="grid gap-1 text-sm font-medium text-zinc-700">
          Stock state
          <select
            className="min-h-11 rounded-md border border-zinc-300 px-3 text-base sm:text-sm"
            defaultValue={stockFilter}
            name="stock"
          >
            <option value="all">All inventory</option>
            <option value="attention">Requires attention</option>
            <option value="sellable">Sellable stock</option>
            <option value="incoming">Incoming stock</option>
          </select>
        </label>
        <label className="grid gap-1 text-sm font-medium text-zinc-700">
          Sort inventory
          <select
            className="min-h-11 rounded-md border border-zinc-300 px-3 text-base sm:text-sm"
            defaultValue={inventorySort}
            name="sort"
          >
            <option value="attention">Needs attention first</option>
            <option value="product">Product name</option>
            <option value="sellable">Lowest sellable first</option>
            <option value="incoming">Most incoming first</option>
            <option value="updated">Recently updated</option>
          </select>
        </label>
        <button className="min-h-11 self-end rounded-md bg-zinc-950 px-5 text-sm font-semibold text-white hover:bg-emerald-700">
          Apply
        </button>
      </form>

      {hasActiveFilters ? (
        <aside
          aria-label="Active inventory filters"
          className="flex flex-wrap items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-950"
        >
          <span className="font-semibold">Active filters:</span>
          {query ? <FilterChip>Search: “{query}”</FilterChip> : null}
          {stockFilter !== "all" ? (
            <FilterChip>Stock: {inventoryFilterLabel(stockFilter)}</FilterChip>
          ) : null}
          {inventorySort !== "attention" ? (
            <FilterChip>Sort: {inventorySortLabel(inventorySort)}</FilterChip>
          ) : null}
          <Link className="ml-auto font-semibold underline" href="/control/supply">
            Clear all
          </Link>
        </aside>
      ) : null}

      <section className="space-y-4" aria-labelledby="inventory-heading">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-zinc-950" id="inventory-heading">
              Inventory
            </h2>
            <p className="mt-1 text-sm text-zinc-600">
              Sellable equals unallocated on-hand units above the safety-stock reserve.
            </p>
          </div>
          <span className="text-sm text-zinc-500">
            {filteredInventory.length} result{filteredInventory.length === 1 ? "" : "s"} · Page{" "}
            {inventoryPage} of {totalPages}
          </span>
        </div>

        {visibleInventory.length === 0 ? (
          <ControlEmptyState
            description="Broaden the inventory search or clear the current stock-state filter."
            title="No inventory records match this view"
          />
        ) : (
          <div className="space-y-3">
            <div
              aria-hidden="true"
              className="hidden gap-3 px-4 text-xs font-semibold uppercase tracking-wide text-zinc-500 lg:grid lg:grid-cols-[minmax(16rem,2fr)_minmax(9rem,1fr)_repeat(6,minmax(4.5rem,.6fr))_minmax(6rem,.7fr)]"
            >
              <span>Product and identifiers</span>
              <span>State</span>
              <span>On hand</span>
              <span>Allocated</span>
              <span>Unallocated</span>
              <span>Safety</span>
              <span>Sellable</span>
              <span>Incoming</span>
              <span>Action</span>
            </div>
            {visibleInventory.map((row) => {
              const state = inventoryState(row);
              return (
                <Link
                  className="grid gap-4 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm transition hover:border-emerald-500 hover:shadow-md lg:grid-cols-[minmax(16rem,2fr)_minmax(9rem,1fr)_repeat(6,minmax(4.5rem,.6fr))_minmax(6rem,.7fr)] lg:items-center"
                  href={`/control/supply/inventory/${row.productId}`}
                  key={row.productId}
                >
                  <div className="min-w-0">
                    <h3 className="font-semibold text-zinc-950">{row.productName}</h3>
                    <p className="mt-1 text-sm font-medium text-zinc-700">
                      <span className="text-zinc-500">product</span>{" "}
                      <span className="select-all font-mono">{row.referenceCode}</span>
                    </p>
                    <div className="mt-2 grid gap-1 text-xs text-zinc-500">
                      <p>
                        Product ID <span className="select-all font-mono">{row.productId}</span>
                      </p>
                      <p>
                        product ID <span className="select-all font-mono">{row.productId}</span>
                      </p>
                      <p>Updated {formatDateTime(row.updatedAt)}</p>
                    </div>
                  </div>
                  <DataCell label="State">
                    <StatusBadge tone={inventoryStateTone(state)}>
                      {inventoryStateLabel(state)}
                    </StatusBadge>
                  </DataCell>
                  <DataCell label="On hand">{row.onHand}</DataCell>
                  <DataCell label="Allocated">{row.allocated}</DataCell>
                  <DataCell label="Unallocated">{row.available}</DataCell>
                  <DataCell label="Safety stock">{row.safetyStock}</DataCell>
                  <DataCell label="Sellable">{getSellableUnits(row)}</DataCell>
                  <DataCell label="Incoming">{row.incoming}</DataCell>
                  <span className="text-sm font-semibold text-emerald-700">
                    {canAdjust ? "Adjust stock →" : "View stock →"}
                  </span>
                </Link>
              );
            })}
          </div>
        )}

        {totalPages > 1 ? (
          <nav aria-label="Inventory pages" className="flex items-center justify-between gap-3">
            <PaginationLink
              disabled={inventoryPage <= 1}
              href={inventoryPageHref(query, stockFilter, inventorySort, inventoryPage - 1)}
            >
              Previous
            </PaginationLink>
            <span className="text-sm text-zinc-500">
              Page {inventoryPage} of {totalPages}
            </span>
            <PaginationLink
              disabled={inventoryPage >= totalPages}
              href={inventoryPageHref(query, stockFilter, inventorySort, inventoryPage + 1)}
            >
              Next
            </PaginationLink>
          </nav>
        ) : null}
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-zinc-950">Purchase orders</h2>
            <p className="mt-1 text-sm text-zinc-600">
              Exact ordered and received quantities for the latest supply commitments.
            </p>
          </div>
          {canPurchase ? (
            <Link
              className="text-sm font-semibold text-emerald-700"
              href="/control/supply/purchase-orders/new"
            >
              Create purchase order
            </Link>
          ) : null}
        </div>
        {purchaseOrders.length === 0 ? (
          <p className="mt-5 text-sm text-zinc-500">No purchase orders have been recorded.</p>
        ) : (
          <div className="mt-6 grid gap-3 xl:grid-cols-2">
            {purchaseOrders.map((order) => (
              <Link
                className="rounded-lg border border-zinc-200 p-4 transition hover:border-emerald-500"
                href={`/control/supply/purchase-orders/${order.id}`}
                key={order.id}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold text-zinc-950">{order.supplier}</h3>
                    <p className="mt-1 break-all text-xs text-zinc-500">
                      Purchase order ID <span className="select-all font-mono">{order.id}</span>
                    </p>
                  </div>
                  <div className="text-right">
                    <StatusBadge tone={purchaseOrderTone(order.status)}>
                      {purchaseOrderStatusLabel(order.status)}
                    </StatusBadge>
                    <p className="mt-1 font-mono text-xs text-zinc-400">
                      System status: {order.status}
                    </p>
                  </div>
                </div>
                <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
                  <PurchaseOrderData label="Ordered" value={`${order.orderedUnits} units`} />
                  <PurchaseOrderData label="Received" value={`${order.receivedUnits} units`} />
                  <PurchaseOrderData
                    label="Outstanding"
                    value={`${Math.max(0, order.orderedUnits - order.receivedUnits)} units`}
                  />
                  <PurchaseOrderData
                    label="Value"
                    value={formatMoney(order.valueCents, order.currency)}
                  />
                  <PurchaseOrderData
                    label="Expected"
                    value={order.expectedAt ? formatCalendarDate(order.expectedAt) : "Unscheduled"}
                  />
                  <PurchaseOrderData label="Action" value="Review order →" />
                </dl>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function DataCell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 lg:hidden">{label}</p>
      <div className="mt-1 font-semibold text-zinc-950 lg:mt-0">{children}</div>
    </div>
  );
}

function PurchaseOrderData({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">{label}</dt>
      <dd className="mt-1 font-semibold text-zinc-950">{value}</dd>
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

function parseInventoryFilter(value?: string): InventoryFilter {
  return ["attention", "sellable", "incoming"].includes(value ?? "")
    ? (value as InventoryFilter)
    : "all";
}

function parseInventorySort(value?: string): InventorySort {
  return ["product", "sellable", "incoming", "updated"].includes(value ?? "")
    ? (value as InventorySort)
    : "attention";
}

function inventoryFilterLabel(value: InventoryFilter): string {
  return {
    all: "All inventory",
    attention: "Requires attention",
    sellable: "Sellable stock",
    incoming: "Incoming stock",
  }[value];
}

function inventorySortLabel(value: InventorySort): string {
  return {
    attention: "Needs attention first",
    product: "Product name",
    sellable: "Lowest sellable first",
    incoming: "Most incoming first",
    updated: "Recently updated",
  }[value];
}

function inventoryStateLabel(value: ReturnType<typeof inventoryState>): string {
  return {
    allocated_beyond_on_hand: "Incoming allocation gap",
    incoming_only: "Incoming only",
    no_sellable_stock: "No sellable stock",
    sellable: "Sellable",
  }[value];
}

function inventoryStateTone(value: ReturnType<typeof inventoryState>) {
  if (["allocated_beyond_on_hand", "no_sellable_stock"].includes(value)) return "danger" as const;
  if (value === "incoming_only") return "warning" as const;
  return "success" as const;
}

function purchaseOrderTone(status: string) {
  if (status === "received") return "success" as const;
  if (status === "cancelled") return "danger" as const;
  if (["submitted", "confirmed", "partially_received"].includes(status)) return "warning" as const;
  return "info" as const;
}

function inventoryPageHref(
  query: string,
  stockFilter: InventoryFilter,
  sort: InventorySort,
  page: number
): string {
  const search = new URLSearchParams();
  if (query) search.set("q", query);
  if (stockFilter !== "all") search.set("stock", stockFilter);
  if (sort !== "attention") search.set("sort", sort);
  search.set("inventoryPage", String(page));
  return `/control/supply?${search.toString()}`;
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("en-SG", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Singapore",
  }).format(new Date(value));
}

function formatCalendarDate(value: string): string {
  return new Intl.DateTimeFormat("en-SG", {
    dateStyle: "medium",
    timeZone: "Asia/Singapore",
  }).format(new Date(`${value}T00:00:00+08:00`));
}
