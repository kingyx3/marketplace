import Link from "next/link";

import {
  ControlData,
  ControlEmptyState,
  ControlPrimaryLink,
} from "@/app/(shop)/control/_components/control-resource-ui";
import type { CategoryRecord } from "@/app/(shop)/control/_components/category-form";
import { PageHeader } from "@/app/_components/page-header";
import { StatusBadge } from "@/app/_components/status-badge";
import { requireControlPermission } from "@/lib/control-access";
import { createServiceClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function ControlCategoriesPage({
  searchParams,
}: {
  searchParams?: Promise<{ q?: string; status?: string }>;
}) {
  const { staff } = await requireControlPermission("catalog.manage", "/control/catalog/categories");
  const params = (await searchParams) ?? {};
  const query = params.q?.trim().toLowerCase() ?? "";
  const status =
    params.status === "active" ? "active" : params.status === "archived" ? "archived" : "all";
  const supabase = createServiceClient();

  const [categoryResult, productResult, setResult] = await Promise.all([
    supabase
      .from("tcg_categories")
      .select("id, parent_id, slug, name, publisher, description, sort_order, active")
      .order("sort_order")
      .order("name"),
    supabase.from("products").select("category_id"),
    supabase.from("sets_releases").select("category_id"),
  ]);

  if (categoryResult.error)
    throw new Error(`Category list failed: ${categoryResult.error.message}`);
  if (productResult.error)
    throw new Error(`Category product counts failed: ${productResult.error.message}`);
  if (setResult.error) throw new Error(`Category set counts failed: ${setResult.error.message}`);

  const allCategories = (categoryResult.data ?? []) as CategoryRecord[];
  const categories = allCategories.filter((category) => {
    const matchesStatus =
      status === "all" || (status === "active" ? category.active : !category.active);
    const matchesQuery =
      !query ||
      category.name.toLowerCase().includes(query) ||
      category.slug.toLowerCase().includes(query) ||
      category.publisher?.toLowerCase().includes(query);
    return matchesStatus && matchesQuery;
  });
  const productCounts = countByCategory(productResult.data ?? []);
  const setCounts = countByCategory(setResult.data ?? []);
  const categoryMap = new Map(allCategories.map((category) => [category.id, category]));

  return (
    <div className="space-y-8">
      <PageHeader
        action={
          <>
            <StatusBadge tone="success">{staff.role}</StatusBadge>
            <ControlPrimaryLink href="/control/catalog/categories/new">
              Create category
            </ControlPrimaryLink>
          </>
        }
        description="Review the catalog hierarchy and open a category to maintain its relationships and lifecycle state."
        eyebrow="Control"
        title="Categories"
      />

      <form className="grid gap-3 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm sm:grid-cols-[minmax(0,1fr)_12rem_auto]">
        <label className="grid gap-1 text-sm font-medium text-zinc-700">
          Search
          <input
            className="min-h-11 rounded-md border border-zinc-300 px-3 text-base sm:text-sm"
            defaultValue={params.q ?? ""}
            name="q"
            placeholder="Name, slug, or publisher"
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

      {categories.length === 0 ? (
        <ControlEmptyState
          action={
            <ControlPrimaryLink href="/control/catalog/categories/new">
              Create category
            </ControlPrimaryLink>
          }
          description="Create the first category or broaden the current filters."
          title="No categories match this view"
        />
      ) : (
        <section className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-zinc-950">Category hierarchy</h2>
            <span className="text-sm text-zinc-500">{categories.length} results</span>
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            {categories.map((category) => (
              <Link
                href={`/control/catalog/categories/${category.id}`}
                key={category.id}
                className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm transition hover:border-emerald-500 hover:shadow-md"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="truncate font-semibold text-zinc-950">{category.name}</h3>
                      <StatusBadge tone={category.active ? "success" : "warning"}>
                        {category.active ? "Active" : "Archived"}
                      </StatusBadge>
                    </div>
                    <p className="mt-1 text-sm text-zinc-500">
                      {categoryPath(category, categoryMap)} · /{category.slug}
                    </p>
                  </div>
                  <span className="text-sm font-semibold text-emerald-700">Open record →</span>
                </div>
                <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
                  <ControlData label="Publisher" value={category.publisher || "Not set"} />
                  <ControlData label="Sets" value={String(setCounts.get(category.id) ?? 0)} />
                  <ControlData
                    label="Products"
                    value={String(productCounts.get(category.id) ?? 0)}
                  />
                </dl>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function categoryPath(category: CategoryRecord, map: Map<string, CategoryRecord>): string {
  const names = [category.name];
  const visited = new Set([category.id]);
  let parentId = category.parent_id;
  while (parentId) {
    if (visited.has(parentId)) return `Invalid cycle / ${names.reverse().join(" / ")}`;
    visited.add(parentId);
    const parent = map.get(parentId);
    if (!parent) break;
    names.push(parent.name);
    parentId = parent.parent_id;
  }
  return names.reverse().join(" / ");
}

function countByCategory(rows: Array<{ category_id?: string | null }>) {
  const counts = new Map<string, number>();
  for (const row of rows) {
    if (!row.category_id) continue;
    counts.set(row.category_id, (counts.get(row.category_id) ?? 0) + 1);
  }
  return counts;
}
