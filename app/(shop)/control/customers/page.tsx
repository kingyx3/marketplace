import { CustomerLifecycleControl } from "@/app/(shop)/control/_components/customer-lifecycle-control";
import { MetricCard } from "@/app/_components/metric-card";
import { PageHeader } from "@/app/_components/page-header";
import { StatusBadge } from "@/app/_components/status-badge";
import { requireControlPermission } from "@/lib/control-access";
import { createServiceClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

interface CustomerRow {
  id: string;
  auth_user_id: string | null;
  email: string;
  name: string | null;
  billing_state: string;
  provisioning_state: string;
  deleted_at: string | null;
  deletion_actor: string | null;
  restored_at: string | null;
  restoration_actor: string | null;
  created_at: string;
  updated_at: string;
  orders: Array<{ id: string }> | null;
  preorders: Array<{ id: string }> | null;
}

export default async function ControlCustomersPage({
  searchParams,
}: {
  searchParams?: Promise<{ q?: string; status?: string }>;
}) {
  const { staff } = await requireControlPermission("manage_customers", "/control/customers");
  const params = (await searchParams) ?? {};
  const query = params.q?.trim().toLowerCase() ?? "";
  const status =
    params.status === "deleted" ? "deleted" : params.status === "active" ? "active" : "all";
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("customers")
    .select(
      "id, auth_user_id, email, name, billing_state, provisioning_state, deleted_at, deletion_actor, restored_at, restoration_actor, created_at, updated_at, orders(id), preorders(id)"
    )
    .order("updated_at", { ascending: false })
    .limit(250);

  if (error) throw new Error(`Customer management lookup failed: ${error.message}`);

  const customers = ((data ?? []) as unknown as CustomerRow[]).filter((customer) => {
    const matchesStatus =
      status === "all" ||
      (status === "deleted" ? Boolean(customer.deleted_at) : !customer.deleted_at);
    const matchesQuery =
      !query ||
      customer.email.toLowerCase().includes(query) ||
      customer.name?.toLowerCase().includes(query) ||
      customer.id.toLowerCase().includes(query);
    return matchesStatus && matchesQuery;
  });
  const allCustomers = (data ?? []) as unknown as CustomerRow[];
  const deletedCount = allCustomers.filter((customer) => customer.deleted_at).length;
  const recoverableCount = allCustomers.filter(
    (customer) => customer.deleted_at && customer.auth_user_id
  ).length;

  return (
    <div className="space-y-8">
      <PageHeader
        action={<StatusBadge tone="success">{staff.role}</StatusBadge>}
        eyebrow="Control"
        title="Customers"
        description="Review account status and restore customer access when required."
      />

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Customers" value={String(allCustomers.length)} detail="Loaded customer records" />
        <MetricCard label="Active" value={String(allCustomers.length - deletedCount)} detail="Available to sign in" />
        <MetricCard label="Deleted" value={String(deletedCount)} detail="Retained for audit" />
        <MetricCard label="Recoverable" value={String(recoverableCount)} detail="Linked identities available" />
      </section>

      <form className="grid gap-3 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm sm:grid-cols-[minmax(0,1fr)_12rem_auto]">
        <label className="grid gap-1 text-sm font-medium text-zinc-700">
          Search
          <input
            className="min-h-11 rounded-md border border-zinc-300 px-3 text-base sm:text-sm"
            defaultValue={params.q ?? ""}
            name="q"
            placeholder="Email, name, or customer ID"
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

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-zinc-950">Accounts</h2>
          <span className="text-sm text-zinc-500">{customers.length} results</span>
        </div>

        {customers.length === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-300 bg-white p-8 text-sm text-zinc-600">
            No customers match this filter.
          </div>
        ) : (
          <div className="grid gap-4 xl:grid-cols-2">
            {customers.map((customer) => {
              const deleted = Boolean(customer.deleted_at);
              const recoverable = Boolean(customer.auth_user_id);

              return (
                <article key={customer.id} className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0">
                      <h3 className="truncate font-semibold text-zinc-950">{customer.name || "Customer"}</h3>
                      <p className="mt-1 break-all text-sm text-zinc-600">{customer.email}</p>
                      <p className="mt-1 break-all text-xs text-zinc-400">{customer.id}</p>
                    </div>
                    <StatusBadge tone={deleted ? "danger" : "success"}>
                      {deleted ? "Deleted" : "Active"}
                    </StatusBadge>
                  </div>

                  <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
                    <Data label="Orders" value={String(customer.orders?.length ?? 0)} />
                    <Data label="Preorders" value={String(customer.preorders?.length ?? 0)} />
                    <Data label="Billing" value={formatLabel(customer.billing_state)} />
                    <Data label="Provisioning" value={formatLabel(customer.provisioning_state)} />
                    <Data label="Created" value={formatDate(customer.created_at)} />
                    <Data label="Updated" value={formatDate(customer.updated_at)} />
                  </dl>

                  {customer.deleted_at ? (
                    <div className="mt-5 rounded-lg border border-rose-100 bg-rose-50 p-3 text-xs text-rose-800">
                      <p>Deleted {formatDateTime(customer.deleted_at)}</p>
                      {customer.deletion_actor ? <p className="mt-1">By {customer.deletion_actor}</p> : null}
                      {!recoverable ? (
                        <p className="mt-2 font-semibold">No linked Auth identity is available. Audit record only.</p>
                      ) : null}
                    </div>
                  ) : customer.restored_at ? (
                    <div className="mt-5 rounded-lg border border-emerald-100 bg-emerald-50 p-3 text-xs text-emerald-800">
                      Restored {formatDateTime(customer.restored_at)}
                    </div>
                  ) : null}

                  <CustomerLifecycleControl
                    customerId={customer.id}
                    deleted={deleted}
                    recoverable={recoverable}
                  />
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
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

function formatLabel(value: string): string {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-SG", { dateStyle: "medium" }).format(new Date(value));
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("en-SG", { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(value)
  );
}
