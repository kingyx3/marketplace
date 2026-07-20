import Link from "next/link";

import {
  ControlData,
  ControlEmptyState,
  ControlPrimaryLink,
} from "@/app/(shop)/control/_components/control-resource-ui";
import type { CategoryOption, SetRecord } from "@/app/(shop)/control/_components/set-form";
import { PageHeader } from "@/app/_components/page-header";
import { StatusBadge } from "@/app/_components/status-badge";
import { requireControlPermission } from "@/lib/control-access";
import { createServiceClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function ControlSetsPage({
  searchParams,
}: {
  searchParams?: Promise<{ q?: string; status?: string }>;
}) {
  const { staff } = await requireControlPermission("catalog.manage", "/control/catalog/sets");
  const params = (await searchParams) ?? {};
  const query = params.q?.trim().toLowerCase() ?? "";
  const status =
    params.status === "active" ? "active" : params.status === "archived" ? "archived" : "all";
  const supabase = createServiceClient();
  const [setResult, categoryResult, productResult] = await Promise.all([
    supabase
      .from("sets_releases")
      .select(
        "id, category_id, name, code, description, release_date, preorder_open_at, preorder_close_at, status, sort_order, active"
      )
      .order("active", { ascending: false })
      .order("sort_order")
      .order("release_date", { ascending: false, nullsFirst: false }),
    supabase.from("tcg_categories").select("id, name, active").order("name"),
    supabase.from("products").select("set_id"),
  ]);

  if (setResult.error) throw new Error(`Set list failed: ${setResult.error.message}`);
  if (categoryResult.error)
    throw new Error(`Category options failed: ${categoryResult.error.message}`);
  if (productResult.error)
    throw new Error(`Set product counts failed: ${productResult.error.message}`);

  const categories = (categoryResult.data ?? []) as CategoryOption[];
  const categoryNames = new Map(categories.map((category) => [category.id, category.name]));
  const productCounts = new Map<string, number>();
  for (const row of productResult.data ?? []) {
    if (!row.set_id) continue;
    productCounts.set(row.set_id, (productCounts.get(row.set_id) ?? 0) + 1);
  }

  const sets = ((setResult.data ?? []) as SetRecord[]).filter((set) => {
    const matchesStatus = status === "all" || (status === "active" ? set.active : !set.active);
    const matchesQuery =
      !query ||
      set.name.toLowerCase().includes(query) ||
      set.code.toLowerCase().includes(query) ||
      categoryNames.get(set.category_id)?.toLowerCase().includes(query);
    return matchesStatus && matchesQuery;
  });

  return (
    <div className="space-y-8">
      <PageHeader
        action={
          <>
            <StatusBadge tone="success">{staff.role}</StatusBadge>
            <ControlPrimaryLink href="/control/catalog/sets/new">Create set</ControlPrimaryLink>
          </>
        }
        description="Review releases and open a set to maintain its category, lifecycle, dates, and preorder window."
        eyebrow="Control"
        title="Sets and releases"
      />

      <form className="grid gap-3 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm sm:grid-cols-[minmax(0,1fr)_12rem_auto]">
        <label className="grid gap-1 text-sm font-medium text-zinc-700">
          Search
          <input
            className="min-h-11 rounded-md border border-zinc-300 px-3 text-base sm:text-sm"
            defaultValue={params.q ?? ""}
            name="q"
            placeholder="Name, code, or category"
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

      {sets.length === 0 ? (
        <ControlEmptyState
          action={
            <ControlPrimaryLink href="/control/catalog/sets/new">Create set</ControlPrimaryLink>
          }
          description={
            categories.some((category) => category.active)
              ? "Create the first set or broaden the current filters."
              : "Create an active category before adding a set."
          }
          title="No sets match this view"
        />
      ) : (
        <section className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-zinc-950">Release directory</h2>
            <span className="text-sm text-zinc-500">{sets.length} results</span>
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            {sets.map((set) => (
              <Link
                href={`/control/catalog/sets/${set.id}`}
                key={set.id}
                className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm transition hover:border-emerald-500 hover:shadow-md"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="truncate font-semibold text-zinc-950">{set.name}</h3>
                      <StatusBadge tone={set.active ? "success" : "warning"}>
                        {set.active ? "Active" : "Archived"}
                      </StatusBadge>
                      <StatusBadge tone="info">{set.status.replaceAll("_", " ")}</StatusBadge>
                    </div>
                    <p className="mt-1 text-sm text-zinc-500">
                      {set.code} · {categoryNames.get(set.category_id) ?? "Unknown category"}
                    </p>
                  </div>
                  <span className="text-sm font-semibold text-emerald-700">Open record →</span>
                </div>
                <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
                  <ControlData label="Release" value={set.release_date ?? "Unscheduled"} />
                  <ControlData label="Products" value={String(productCounts.get(set.id) ?? 0)} />
                  <ControlData label="Sort order" value={String(set.sort_order)} />
                </dl>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
