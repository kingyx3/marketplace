import {
  setControlCategoryActive,
  upsertControlCategory,
} from "@/app/actions/control";
import { requireControlPermission } from "@/lib/control-access";
import { createServiceClient } from "@/lib/supabase";

interface CategoryRow {
  id: string;
  parent_id: string | null;
  slug: string;
  name: string;
  publisher: string | null;
  description: string | null;
  sort_order: number;
  active: boolean;
}

export const dynamic = "force-dynamic";

export default async function ControlCategoriesPage() {
  await requireControlPermission("manage_catalog", "/control/categories");
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

  if (categoryResult.error) throw new Error(`Category list failed: ${categoryResult.error.message}`);
  if (productResult.error) throw new Error(`Category product counts failed: ${productResult.error.message}`);
  if (setResult.error) throw new Error(`Category set counts failed: ${setResult.error.message}`);

  const categories = (categoryResult.data ?? []) as CategoryRow[];
  const productCounts = countByCategory(productResult.data ?? []);
  const setCounts = countByCategory(setResult.data ?? []);
  const categoryMap = new Map(categories.map((category) => [category.id, category]));

  return (
    <div className="space-y-8">
      <PageHeading
        title="Categories"
        description="Maintain the catalog hierarchy, ordering, publisher metadata, and archive state. Circular relationships are rejected by the database."
      />

      <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-zinc-950">Add category</h2>
        <CategoryForm categories={categories} />
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-zinc-950">Category hierarchy</h2>
          <span className="text-sm text-zinc-500">{categories.length} categories</span>
        </div>

        {categories.length === 0 ? (
          <EmptyState text="No categories have been configured." />
        ) : (
          <div className="grid gap-4 xl:grid-cols-2">
            {categories.map((category) => (
              <article key={category.id} className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold text-zinc-950">{category.name}</h3>
                      <Status active={category.active} />
                    </div>
                    <p className="mt-1 text-sm text-zinc-500">
                      {categoryPath(category, categoryMap)} · /{category.slug}
                    </p>
                  </div>
                  <form action={setControlCategoryActive}>
                    <input name="id" type="hidden" value={category.id} />
                    <input name="active" type="hidden" value={category.active ? "false" : "true"} />
                    <button
                      className={
                        category.active
                          ? "rounded-md border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50"
                          : "rounded-md border border-emerald-200 px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"
                      }
                    >
                      {category.active ? "Archive" : "Restore"}
                    </button>
                  </form>
                </div>

                <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-3">
                  <Data label="Publisher" value={category.publisher || "Not set"} />
                  <Data label="Sets" value={String(setCounts.get(category.id) ?? 0)} />
                  <Data label="Products" value={String(productCounts.get(category.id) ?? 0)} />
                </dl>

                <details className="mt-5 border-t border-zinc-100 pt-4">
                  <summary className="cursor-pointer text-sm font-semibold text-zinc-700">Edit category</summary>
                  <CategoryForm categories={categories} category={category} />
                </details>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function CategoryForm({
  categories,
  category,
}: {
  categories: CategoryRow[];
  category?: CategoryRow;
}) {
  return (
    <form action={upsertControlCategory} className="mt-4 grid gap-4">
      {category ? <input name="categoryId" type="hidden" value={category.id} /> : null}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Field label="Name" name="name" required value={category?.name} />
        <Field label="Slug" name="slug" required value={category?.slug} />
        <Field label="Publisher" name="publisher" value={category?.publisher ?? ""} />
        <Field
          label="Sort order"
          min={0}
          name="sortOrder"
          required
          type="number"
          value={String(category?.sort_order ?? 0)}
        />
      </div>
      <label className="grid gap-1 text-sm font-medium text-zinc-700">
        Parent category
        <select
          className="min-h-10 rounded-md border border-zinc-300 px-3 text-sm"
          defaultValue={category?.parent_id ?? ""}
          name="parentId"
        >
          <option value="">Top level</option>
          {categories
            .filter((candidate) => candidate.id !== category?.id)
            .map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.name}{candidate.active ? "" : " (archived)"}
              </option>
            ))}
        </select>
      </label>
      <label className="grid gap-1 text-sm font-medium text-zinc-700">
        Description
        <textarea
          className="min-h-24 rounded-md border border-zinc-300 px-3 py-2 text-sm"
          defaultValue={category?.description ?? ""}
          maxLength={2000}
          name="description"
        />
      </label>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm font-medium text-zinc-700">
          <input name="active" type="hidden" value="false" />
          <input defaultChecked={category?.active ?? true} name="active" type="checkbox" value="true" />
          Active
        </label>
        <button className="rounded-md bg-zinc-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700">
          {category ? "Save category" : "Create category"}
        </button>
      </div>
    </form>
  );
}

function categoryPath(category: CategoryRow, map: Map<string, CategoryRow>): string {
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

function Field({
  label,
  name,
  value,
  required = false,
  type = "text",
  min,
}: {
  label: string;
  name: string;
  value?: string;
  required?: boolean;
  type?: string;
  min?: number;
}) {
  return (
    <label className="grid gap-1 text-sm font-medium text-zinc-700">
      {label}
      <input
        className="min-h-10 rounded-md border border-zinc-300 px-3 text-sm"
        defaultValue={value}
        min={min}
        name={name}
        required={required}
        type={type}
      />
    </label>
  );
}

function PageHeading({ title, description }: { title: string; description: string }) {
  return (
    <div>
      <p className="text-sm font-semibold uppercase tracking-[0.16em] text-emerald-700">Catalog</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-950">{title}</h1>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-600">{description}</p>
    </div>
  );
}

function Status({ active }: { active: boolean }) {
  return (
    <span
      className={
        active
          ? "rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700"
          : "rounded-full bg-zinc-100 px-2 py-1 text-xs font-semibold text-zinc-600"
      }
    >
      {active ? "Active" : "Archived"}
    </span>
  );
}

function Data({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">{label}</dt>
      <dd className="mt-1 text-zinc-800">{value}</dd>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="rounded-xl border border-dashed border-zinc-300 bg-white p-8 text-sm text-zinc-500">{text}</div>;
}
