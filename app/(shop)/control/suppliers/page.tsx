import Link from "next/link";

import {
  ControlData,
  ControlEmptyState,
  ControlPrimaryLink,
} from "@/app/(shop)/control/_components/control-resource-ui";
import type { SupplierRecord } from "@/app/(shop)/control/_components/supplier-form";
import { MetricCard } from "@/app/_components/metric-card";
import { PageHeader } from "@/app/_components/page-header";
import { StatusBadge } from "@/app/_components/status-badge";
import { setControlSupplierActive } from "@/app/actions/control";
import { requireControlPermission } from "@/lib/control-access";
import { createServiceClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 30;

export default async function ControlSuppliersPage({
  searchParams,
}: {
  searchParams?: Promise<{ q?: string; status?: string; page?: string }>;
}) {
  const { staff } = await requireControlPermission("manage_suppliers", "/control/suppliers");
  const params = (await searchParams) ?? {};
  const query = params.q?.trim() ?? "";
  const status =
    params.status === "active" ? "active" : params.status === "archived" ? "archived" : "all";
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const offset = (page - 1) * PAGE_SIZE;
  const supabase = createServiceClient();

  let request = supabase
    .from("suppliers")
    .select(
      "id, name, supplier_type, region, contact, payment_terms, min_order_cents, currency, notes, active, updated_at",
      { count: "exact" }
    );

  if (status !== "all") request = request.eq("active", status === "active");
  if (query) request = request.ilike("name", `%${escapeLike(query)}%`);

  const { data, error, count } = await request
    .order("active", { ascending: false })
    .order("name")
    .range(offset, offset + PAGE_SIZE - 1);
  if (error) throw new Error(`Supplier list failed: ${error.message}`);

  const suppliers = (data ?? []) as SupplierRecord[];
  const total = count ?? suppliers.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-8">
      <PageHeader
        action={
          <>
            <StatusBadge tone="success">{staff.role}</StatusBadge>
            <ControlPrimaryLink href="/control/suppliers/new">Add supplier</ControlPrimaryLink>
          </>
        }
        description="Review supplier records and open a supplier to maintain contacts, commercial terms, and lifecycle state."
        eyebrow="Control"
        title="Suppliers"
      />

      <section className="grid gap-4 sm:grid-cols-3">
        <MetricCard label="Matching suppliers" value={String(total)} detail="Current search and status filter" />
        <MetricCard
          label="Visible on page"
          value={String(suppliers.length)}
          detail={`Page ${Math.min(page, totalPages)} of ${totalPages}`}
        />
        <MetricCard
          label="Active on page"
          value={String(suppliers.filter((supplier) => supplier.active).length)}
          detail="Available for new purchase orders"
        />
      </section>

      <form className="grid gap-3 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm sm:grid-cols-[minmax(0,1fr)_12rem_auto]">
        <label className="grid gap-1 text-sm font-medium text-zinc-700">
          Search
          <input
            className="min-h-11 rounded-md border border-zinc-300 px-3 text-base sm:text-sm"
            defaultValue={query}
            name="q"
            placeholder="Supplier name"
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
            <option value="archived">Archived</option>
          </select>
        </label>
        <button className="min-h-11 self-end rounded-md bg-zinc-950 px-5 text-sm font-semibold text-white hover:bg-emerald-700">
          Filter
        </button>
      </form>

      {suppliers.length === 0 ? (
        <ControlEmptyState
          action={<ControlPrimaryLink href="/control/suppliers/new">Add supplier</ControlPrimaryLink>}
          description="Create the first supplier or broaden the current filters."
          title="No suppliers match this view"
        />
      ) : (
        <section className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-zinc-950">Supplier directory</h2>
            <span className="text-sm text-zinc-500">{total} records</span>
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            {suppliers.map((supplier) => {
              const contact = supplier.contact ?? {};
              const contactName = typeof contact.name === "string" ? contact.name : "Not set";
              return (
                <article key={supplier.id} className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          className="truncate font-semibold text-zinc-950 hover:text-emerald-700"
                          href={`/control/suppliers/${supplier.id}`}
                        >
                          {supplier.name}
                        </Link>
                        <StatusBadge tone={supplier.active ? "success" : "warning"}>
                          {supplier.active ? "Active" : "Archived"}
                        </StatusBadge>
                      </div>
                      <p className="mt-1 text-sm text-zinc-500">
                        {supplier.supplier_type.replaceAll("_", " ")}
                        {supplier.region ? ` · ${supplier.region}` : ""}
                      </p>
                    </div>
                    <form action={setControlSupplierActive}>
                      <input name="id" type="hidden" value={supplier.id} />
                      <input name="active" type="hidden" value={supplier.active ? "false" : "true"} />
                      <button className="min-h-10 rounded-md border border-zinc-300 px-3 text-xs font-semibold text-zinc-700 hover:border-emerald-600 hover:text-emerald-700">
                        {supplier.active ? "Archive" : "Restore"}
                      </button>
                    </form>
                  </div>
                  <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
                    <ControlData label="Contact" value={contactName} />
                    <ControlData label="Payment terms" value={supplier.payment_terms || "Not set"} />
                    <ControlData
                      label="Minimum order"
                      value={
                        supplier.min_order_cents === null
                          ? "Not set"
                          : `${supplier.currency} ${(supplier.min_order_cents / 100).toFixed(2)}`
                      }
                    />
                  </dl>
                </article>
              );
            })}
          </div>
        </section>
      )}

      {totalPages > 1 ? (
        <nav aria-label="Supplier pages" className="flex items-center justify-between gap-3">
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
    return <span className="rounded-md border border-zinc-200 px-4 py-2 text-sm text-zinc-400">{children}</span>;
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
  return `/control/suppliers?${search.toString()}`;
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}
