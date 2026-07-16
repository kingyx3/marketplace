import Link from "next/link";

import { hasControlPermission, requireControlPermission } from "@/lib/control-access";
import { createServiceClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function ControlOverviewPage() {
  const { staff } = await requireControlPermission("view_control", "/control");
  const supabase = createServiceClient();
  const [products, suppliers, categories, sets, administrators, audit] = await Promise.all([
    countRows(supabase.from("products").select("*", { count: "exact", head: true }).eq("active", true), "products"),
    countRows(supabase.from("suppliers").select("*", { count: "exact", head: true }).eq("active", true), "suppliers"),
    countRows(supabase.from("tcg_categories").select("*", { count: "exact", head: true }).eq("active", true), "categories"),
    countRows(supabase.from("sets_releases").select("*", { count: "exact", head: true }).eq("active", true), "sets"),
    countRows(supabase.from("staff_users").select("*", { count: "exact", head: true }).eq("active", true), "administrators"),
    countRows(supabase.from("audit_logs").select("*", { count: "exact", head: true }), "audit records"),
  ]);

  const destinations = [
    {
      href: "/control/operations",
      label: "Operations",
      detail: "Inventory, purchasing, catalog products, SKUs, and order exceptions.",
      visible: hasControlPermission(staff, "manage_full_operations"),
    },
    {
      href: "/control/suppliers",
      label: "Suppliers",
      detail: "Manage supplier profiles, contact details, terms, and lifecycle state.",
      visible: hasControlPermission(staff, "manage_suppliers"),
    },
    {
      href: "/control/categories",
      label: "Categories",
      detail: "Maintain parent-child catalog hierarchy and publication state.",
      visible: hasControlPermission(staff, "manage_catalog"),
    },
    {
      href: "/control/sets",
      label: "Sets",
      detail: "Manage releases, preorder windows, status, and category relationships.",
      visible: hasControlPermission(staff, "manage_catalog"),
    },
    {
      href: "/control/administrators",
      label: "Administrators",
      detail: "Delegate role-scoped access and revoke database-managed administrators.",
      visible: hasControlPermission(staff, "manage_admins"),
    },
    {
      href: "/control/audit",
      label: "Audit log",
      detail: "Review recent administrative mutations and affected records.",
      visible: hasControlPermission(staff, "view_audit"),
    },
  ].filter((item) => item.visible);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-emerald-700">Overview</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-950">Operations control</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-600">
            Manage marketplace operations through server-authorized, audited workflows.
          </p>
        </div>
        <span className="rounded-full border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium capitalize text-zinc-700">
          {staff.role}
        </span>
      </div>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <Metric label="Active products" value={products} />
        <Metric label="Active suppliers" value={suppliers} />
        <Metric label="Active categories" value={categories} />
        <Metric label="Active sets" value={sets} />
        <Metric label="Active staff" value={administrators} />
        <Metric label="Audit records" value={audit} />
      </section>

      <section>
        <h2 className="text-lg font-semibold text-zinc-950">Available workspaces</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {destinations.map((item) => (
            <Link
              key={item.href}
              className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm transition hover:border-emerald-500 hover:shadow-md"
              href={item.href}
            >
              <h3 className="font-semibold text-zinc-950">{item.label}</h3>
              <p className="mt-2 text-sm leading-6 text-zinc-600">{item.detail}</p>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <article className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
      <p className="text-sm font-medium text-zinc-500">{label}</p>
      <p className="mt-2 text-3xl font-semibold tracking-tight text-zinc-950">{value}</p>
    </article>
  );
}

async function countRows(
  query: PromiseLike<{ count: number | null; error: { message: string } | null }>,
  label: string
): Promise<number> {
  const result = await query;
  if (result.error) throw new Error(`Unable to count ${label}: ${result.error.message}`);
  return result.count ?? 0;
}
