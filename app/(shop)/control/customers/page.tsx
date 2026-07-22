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
  customerAccountLabel,
  customerAccountSystemStatus,
  customerProvisioningLabel,
  customerProvisioningNeedsAttention,
  isCustomerIdentifier,
  parseCustomerIdentity,
  parseCustomerProvisioning,
  parseCustomerSort,
  parseCustomerStatus,
  type CustomerIdentityFilter,
  type CustomerProvisioningFilter,
  type CustomerSort,
  type CustomerStatusFilter,
} from "@/lib/control-customer-view";
import { createSecretClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

interface CustomerSearchParams {
  q?: string;
  status?: string;
  identity?: string;
  provisioning?: string;
  sort?: string;
  page?: string;
}

interface CustomerRow {
  id: string;
  auth_user_id: string | null;
  email: string;
  name: string | null;
  provisioning_state: string;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
  orders: Array<{ id: string }> | null;
  preorders: Array<{ id: string }> | null;
}

export default async function ControlCustomersPage({
  searchParams,
}: {
  searchParams?: Promise<CustomerSearchParams>;
}) {
  const { staff } = await requireControlPermission("customers.view", "/control/customers");
  const params = (await searchParams) ?? {};
  const query = (params.q ?? "").trim().slice(0, 160);
  const status = parseCustomerStatus(params.status);
  const identity = parseCustomerIdentity(params.identity);
  const provisioning = parseCustomerProvisioning(params.provisioning);
  const sort = parseCustomerSort(params.sort);
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const offset = (page - 1) * PAGE_SIZE;
  const supabase = createSecretClient();

  let request = supabase
    .from("customers")
    .select(
      "id, auth_user_id, email, name, provisioning_state, deleted_at, created_at, updated_at, orders(id), preorders(id)",
      { count: "exact" }
    );

  if (status === "disabled") request = request.not("deleted_at", "is", null);
  if (status === "active") request = request.is("deleted_at", null);
  if (identity === "linked") request = request.not("auth_user_id", "is", null);
  if (identity === "unlinked") request = request.is("auth_user_id", null);
  if (provisioning === "attention") {
    request = request.in("provisioning_state", ["pending", "error"]);
  } else if (provisioning !== "all") {
    request = request.eq("provisioning_state", provisioning);
  }
  if (query) {
    if (isCustomerIdentifier(query)) {
      request = request.or(`id.eq.${query},auth_user_id.eq.${query}`);
    } else {
      const safeQuery = query.replace(/[,%_]/g, " ").trim();
      if (safeQuery) request = request.or(`email.ilike.%${safeQuery}%,name.ilike.%${safeQuery}%`);
    }
  }

  if (sort === "updated_asc") {
    request = request.order("updated_at", { ascending: true });
  } else if (sort === "created_desc") {
    request = request.order("created_at", { ascending: false });
  } else if (sort === "name") {
    request = request
      .order("name", { ascending: true, nullsFirst: false })
      .order("email", { ascending: true });
  } else if (sort === "email") {
    request = request.order("email", { ascending: true });
  } else {
    request = request.order("updated_at", { ascending: false });
  }

  const { data, error, count } = await request.range(offset, offset + PAGE_SIZE - 1);
  if (error) throw new Error(`Customer management lookup failed: ${error.message}`);

  const customers = (data ?? []) as unknown as CustomerRow[];
  const total = count ?? customers.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const normalizedFilters = { query, status, identity, provisioning, sort };
  if (page > totalPages) redirect(customerPageHref(normalizedFilters, totalPages));

  const disabledCount = customers.filter((customer) => customer.deleted_at).length;
  const provisioningAttentionCount = customers.filter((customer) =>
    customerProvisioningNeedsAttention(customer.provisioning_state)
  ).length;
  const hasActiveFilters =
    Boolean(query) ||
    status !== "all" ||
    identity !== "all" ||
    provisioning !== "all" ||
    sort !== "updated_desc";
  const canManage = hasControlPermission(staff, "customers.manage");

  return (
    <div className="space-y-8">
      <PageHeader
        action={<StatusBadge tone="success">{staff.role}</StatusBadge>}
        description="Find exact account records, review sign-in linkage and provisioning state, and open the lifecycle history before taking action."
        eyebrow="Control"
        title="Customers"
      />

      {provisioningAttentionCount > 0 ? (
        <section
          aria-labelledby="customer-attention-title"
          className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-amber-300 bg-amber-50 p-5"
        >
          <div>
            <h2 className="font-semibold text-amber-950" id="customer-attention-title">
              {provisioningAttentionCount} visible account
              {provisioningAttentionCount === 1 ? "" : "s"} need provisioning review
            </h2>
            <p className="mt-1 text-sm leading-6 text-amber-900">
              Pending or failed provisioning can prevent the expected account state from becoming
              available.
            </p>
          </div>
          <Link
            className="inline-flex min-h-11 items-center rounded-md border border-amber-400 bg-white px-4 text-sm font-semibold text-amber-950 hover:border-amber-600"
            href="/control/customers?provisioning=attention"
          >
            Review provisioning attention
          </Link>
        </section>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Matching accounts"
          value={String(total)}
          detail="Current search and filters"
        />
        <MetricCard
          label="Visible accounts"
          value={String(customers.length)}
          detail={`Page ${page} of ${totalPages}`}
        />
        <MetricCard
          label="Access disabled on page"
          value={String(disabledCount)}
          detail="Retained for audit and restoration"
        />
        <MetricCard
          label="Provisioning attention"
          value={String(provisioningAttentionCount)}
          detail="Pending or error on this page"
        />
      </section>

      <form className="grid gap-3 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm xl:grid-cols-[minmax(0,1fr)_11rem_11rem_12rem_12rem_auto]">
        <label className="grid gap-1 text-sm font-medium text-zinc-700">
          Search accounts
          <input
            className="min-h-11 rounded-md border border-zinc-300 px-3 text-base sm:text-sm"
            defaultValue={query}
            maxLength={160}
            name="q"
            placeholder="Name, email, customer ID, or Auth user ID"
          />
        </label>
        <label className="grid gap-1 text-sm font-medium text-zinc-700">
          Access state
          <select
            className="min-h-11 rounded-md border border-zinc-300 px-3 text-base sm:text-sm"
            defaultValue={status}
            name="status"
          >
            <option value="all">All access states</option>
            <option value="active">Active</option>
            <option value="disabled">Access disabled</option>
          </select>
        </label>
        <label className="grid gap-1 text-sm font-medium text-zinc-700">
          Sign-in identity
          <select
            className="min-h-11 rounded-md border border-zinc-300 px-3 text-base sm:text-sm"
            defaultValue={identity}
            name="identity"
          >
            <option value="all">All identities</option>
            <option value="linked">Linked</option>
            <option value="unlinked">Not linked</option>
          </select>
        </label>
        <label className="grid gap-1 text-sm font-medium text-zinc-700">
          Provisioning
          <select
            className="min-h-11 rounded-md border border-zinc-300 px-3 text-base sm:text-sm"
            defaultValue={provisioning}
            name="provisioning"
          >
            <option value="all">All provisioning</option>
            <option value="attention">Needs attention</option>
            <option value="active">Provisioned</option>
            <option value="pending">Pending</option>
            <option value="error">Error</option>
          </select>
        </label>
        <label className="grid gap-1 text-sm font-medium text-zinc-700">
          Sort
          <select
            className="min-h-11 rounded-md border border-zinc-300 px-3 text-base sm:text-sm"
            defaultValue={sort}
            name="sort"
          >
            <option value="updated_desc">Recently updated</option>
            <option value="updated_asc">Oldest update first</option>
            <option value="created_desc">Recently created</option>
            <option value="name">Customer name</option>
            <option value="email">Email</option>
          </select>
        </label>
        <button className="min-h-11 self-end rounded-md bg-zinc-950 px-5 text-sm font-semibold text-white hover:bg-emerald-700">
          Apply
        </button>
      </form>

      {hasActiveFilters ? (
        <aside
          aria-label="Active customer filters"
          className="flex flex-wrap items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-950"
        >
          <span className="font-semibold">Active filters:</span>
          {query ? <FilterChip>Search: “{query}”</FilterChip> : null}
          {status !== "all" ? <FilterChip>Access: {statusLabel(status)}</FilterChip> : null}
          {identity !== "all" ? <FilterChip>Identity: {identityLabel(identity)}</FilterChip> : null}
          {provisioning !== "all" ? (
            <FilterChip>Provisioning: {provisioningFilterLabel(provisioning)}</FilterChip>
          ) : null}
          {sort !== "updated_desc" ? <FilterChip>Sort: {sortLabel(sort)}</FilterChip> : null}
          <Link className="ml-auto font-semibold underline" href="/control/customers">
            Clear all
          </Link>
        </aside>
      ) : null}

      {customers.length === 0 ? (
        <ControlEmptyState
          description="Broaden the search or clear one of the account, identity, or provisioning filters."
          title="No customers match this view"
        />
      ) : (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-zinc-950">Accounts</h2>
              <p className="mt-1 text-sm text-zinc-600">
                Recognizable account details lead; exact system identifiers remain available for
                support correlation.
              </p>
            </div>
            <span className="text-sm text-zinc-500">{total} results</span>
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            {customers.map((customer) => {
              const disabled = Boolean(customer.deleted_at);
              return (
                <Link
                  className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm transition hover:border-emerald-500 hover:shadow-md"
                  href={`/control/customers/${customer.id}`}
                  key={customer.id}
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0">
                      <h3 className="truncate font-semibold text-zinc-950">
                        {customer.name || "Customer"}
                      </h3>
                      <p className="mt-1 break-all text-sm text-zinc-600">{customer.email}</p>
                      <dl className="mt-3 grid gap-1 text-xs text-zinc-500">
                        <div>
                          <dt className="inline font-medium">Customer ID </dt>
                          <dd className="inline select-all font-mono">{customer.id}</dd>
                        </div>
                        <div>
                          <dt className="inline font-medium">Auth user ID </dt>
                          <dd className="inline select-all font-mono">
                            {customer.auth_user_id ?? "Not linked"}
                          </dd>
                        </div>
                      </dl>
                    </div>
                    <div className="grid justify-items-end gap-2">
                      <StatusBadge tone={disabled ? "danger" : "success"}>
                        {customerAccountLabel(customer.deleted_at)}
                      </StatusBadge>
                      <StatusBadge tone={provisioningTone(customer.provisioning_state)}>
                        {customerProvisioningLabel(customer.provisioning_state)}
                      </StatusBadge>
                      <p className="font-mono text-xs text-zinc-400">
                        System: {customerAccountSystemStatus(customer.deleted_at)} ·{" "}
                        {customer.provisioning_state}
                      </p>
                    </div>
                  </div>
                  <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-4">
                    <ControlData label="Orders" value={String(customer.orders?.length ?? 0)} />
                    <ControlData
                      label="Preorders"
                      value={String(customer.preorders?.length ?? 0)}
                    />
                    <ControlData label="Updated" value={formatDateTime(customer.updated_at)} />
                    <ControlData
                      label="Next step"
                      value={canManage && disabled ? "Review restoration →" : "Open account →"}
                    />
                  </dl>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {totalPages > 1 ? (
        <nav aria-label="Customer pages" className="flex items-center justify-between gap-3">
          <PaginationLink disabled={page <= 1} href={customerPageHref(normalizedFilters, page - 1)}>
            Previous
          </PaginationLink>
          <span className="text-sm text-zinc-500">
            Page {page} of {totalPages}
          </span>
          <PaginationLink
            disabled={page >= totalPages}
            href={customerPageHref(normalizedFilters, page + 1)}
          >
            Next
          </PaginationLink>
        </nav>
      ) : null}
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

function customerPageHref(
  filters: {
    query: string;
    status: CustomerStatusFilter;
    identity: CustomerIdentityFilter;
    provisioning: CustomerProvisioningFilter;
    sort: CustomerSort;
  },
  page: number
): string {
  const search = new URLSearchParams();
  if (filters.query) search.set("q", filters.query);
  if (filters.status !== "all") search.set("status", filters.status);
  if (filters.identity !== "all") search.set("identity", filters.identity);
  if (filters.provisioning !== "all") search.set("provisioning", filters.provisioning);
  if (filters.sort !== "updated_desc") search.set("sort", filters.sort);
  if (page > 1) search.set("page", String(page));
  const value = search.toString();
  return value ? `/control/customers?${value}` : "/control/customers";
}

function statusLabel(value: CustomerStatusFilter): string {
  return { all: "All", active: "Active", disabled: "Access disabled" }[value];
}

function identityLabel(value: CustomerIdentityFilter): string {
  return { all: "All", linked: "Linked", unlinked: "Not linked" }[value];
}

function provisioningFilterLabel(value: CustomerProvisioningFilter): string {
  return {
    all: "All",
    attention: "Needs attention",
    active: "Provisioned",
    pending: "Pending",
    error: "Error",
  }[value];
}

function sortLabel(value: CustomerSort): string {
  return {
    updated_desc: "Recently updated",
    updated_asc: "Oldest update first",
    created_desc: "Recently created",
    name: "Customer name",
    email: "Email",
  }[value];
}

function provisioningTone(value: string) {
  if (value === "error") return "danger" as const;
  if (value === "pending") return "warning" as const;
  return "success" as const;
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("en-SG", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Singapore",
  }).format(new Date(value));
}
