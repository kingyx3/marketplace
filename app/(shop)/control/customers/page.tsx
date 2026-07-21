import Link from "next/link";

import {
  ControlData,
  ControlEmptyState,
} from "@/app/(shop)/control/_components/control-resource-ui";
import { MetricCard } from "@/app/_components/metric-card";
import { PageHeader } from "@/app/_components/page-header";
import { StatusBadge } from "@/app/_components/status-badge";
import { requireControlPermission } from "@/lib/control-access";
import { createSecretClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

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
  searchParams?: Promise<{ q?: string; status?: string; page?: string }>;
}) {
  const { staff } = await requireControlPermission("customers.view", "/control/customers");
  const params = (await searchParams) ?? {};
  const query = params.q?.trim() ?? "";
  const status =
    params.status === "deleted" ? "deleted" : params.status === "active" ? "active" : "all";
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const offset = (page - 1) * PAGE_SIZE;
  const supabase = createSecretClient();

  let request = supabase
    .from("customers")
    .select(
      "id, auth_user_id, email, name, provisioning_state, deleted_at, created_at, updated_at, orders(id), preorders(id)",
      { count: "exact" }
    );

  if (status === "deleted") request = request.not("deleted_at", "is", null);
  if (status === "active") request = request.is("deleted_at", null);
  if (query) {
    const safeQuery = query.replace(/[,%_]/g, " ").trim();
    if (safeQuery) request = request.or(`email.ilike.%${safeQuery}%,name.ilike.%${safeQuery}%`);
  }

  const { data, error, count } = await request
    .order("updated_at", { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1);
  if (error) throw new Error(`Customer management lookup failed: ${error.message}`);

  const customers = (data ?? []) as unknown as CustomerRow[];
  const total = count ?? customers.length;
  const deletedCount = customers.filter((customer) => customer.deleted_at).length;
  const recoverableCount = customers.filter(
    (customer) => customer.deleted_at && customer.auth_user_id
  ).length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-8">
      <PageHeader
        action={<StatusBadge tone="success">{staff.role}</StatusBadge>}
        eyebrow="Control"
        title="Customers"
        description="Search account records and open a customer to review lifecycle history or restore access."
      />

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Matching"
          value={String(total)}
          detail="Current search and status filter"
        />
        <MetricCard
          label="Visible"
          value={String(customers.length)}
          detail={`Page ${page} of ${totalPages}`}
        />
        <MetricCard
          label="Deleted on page"
          value={String(deletedCount)}
          detail="Retained for audit"
        />
        <MetricCard
          label="Recoverable on page"
          value={String(recoverableCount)}
          detail="Linked identities available"
        />
      </section>

      <form className="grid gap-3 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm sm:grid-cols-[minmax(0,1fr)_12rem_auto]">
        <label className="grid gap-1 text-sm font-medium text-zinc-700">
          Search
          <input
            className="min-h-11 rounded-md border border-zinc-300 px-3 text-base sm:text-sm"
            defaultValue={params.q ?? ""}
            name="q"
            placeholder="Email or name"
          />
        </label>
        <label className="grid gap-1 text-sm font-medium text-zinc-700">
          Status
          <select
            className="min-h-11 rounded-md border border-zinc-300 px-3 text-base sm:text-sm"
            defaultValue={status}
            name="status"
          >
            <option value="all">All</option>
            <option value="active">Active</option>
            <option value="deleted">Deleted</option>
          </select>
        </label>
        <button className="min-h-11 self-end rounded-md bg-zinc-950 px-5 text-sm font-semibold text-white hover:bg-emerald-700">
          Filter
        </button>
      </form>

      {customers.length === 0 ? (
        <ControlEmptyState
          description="Broaden the current search or status filter."
          title="No customers match this view"
        />
      ) : (
        <section className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-zinc-950">Accounts</h2>
            <span className="text-sm text-zinc-500">{total} results</span>
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            {customers.map((customer) => {
              const deleted = Boolean(customer.deleted_at);
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
                      <p className="mt-1 break-all font-mono text-xs text-zinc-400">
                        {customer.id}
                      </p>
                    </div>
                    <StatusBadge tone={deleted ? "danger" : "success"}>
                      {deleted ? "Deleted" : "Active"}
                    </StatusBadge>
                  </div>
                  <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-3">
                    <ControlData label="Orders" value={String(customer.orders?.length ?? 0)} />
                    <ControlData
                      label="Preorders"
                      value={String(customer.preorders?.length ?? 0)}
                    />
                    <ControlData label="Updated" value={formatDate(customer.updated_at)} />
                  </dl>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {totalPages > 1 ? (
        <nav aria-label="Customer pages" className="flex items-center justify-between gap-3">
          <PaginationLink disabled={page <= 1} href={pageHref(params, page - 1)}>
            Previous
          </PaginationLink>
          <span className="text-sm text-zinc-500">
            Page {page} of {totalPages}
          </span>
          <PaginationLink disabled={page >= totalPages} href={pageHref(params, page + 1)}>
            Next
          </PaginationLink>
        </nav>
      ) : null}
    </div>
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

function pageHref(params: { q?: string; status?: string }, page: number): string {
  const search = new URLSearchParams();
  if (params.q) search.set("q", params.q);
  if (params.status) search.set("status", params.status);
  search.set("page", String(page));
  return `/control/customers?${search.toString()}`;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-SG", { dateStyle: "medium" }).format(new Date(value));
}
