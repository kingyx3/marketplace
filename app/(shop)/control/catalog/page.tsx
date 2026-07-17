import Link from "next/link";

import { upsertControlCategory, upsertControlSet } from "@/app/actions/control";
import { MetricCard } from "@/app/_components/metric-card";
import { PageHeader } from "@/app/_components/page-header";
import { StatusBadge } from "@/app/_components/status-badge";
import {
  ProductIntakeForm,
  type CatalogCategoryOption,
  type CatalogSetOption,
} from "@/app/(shop)/control/_components/product-intake-form";
import { requireControlPermission } from "@/lib/control-access";
import { createServiceClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

interface ProductRow {
  id: string;
  name: string;
  slug: string;
  product_type: string;
  language: string;
  active: boolean;
  created_at: string;
  tcg_categories: { name: string } | null;
  sets_releases: { name: string; code: string } | null;
  listing_items: Array<{ published: boolean }> | null;
}

export default async function ControlCatalogPage() {
  const { staff } = await requireControlPermission("manage_catalog", "/control/catalog");
  const supabase = createServiceClient();
  const [categoryResult, setResult, productResult] = await Promise.all([
    supabase
      .from("tcg_categories")
      .select("id, name, slug, active")
      .order("name"),
    supabase
      .from("sets_releases")
      .select("id, category_id, name, code, active")
      .order("release_date", { ascending: false }),
    supabase
      .from("products")
      .select(
        "id, name, slug, product_type, language, active, created_at, tcg_categories(name), sets_releases(name, code), listing_items(published)"
      )
      .order("created_at", { ascending: false })
      .limit(40),
  ]);

  if (categoryResult.error) throw new Error(`Catalog category lookup failed: ${categoryResult.error.message}`);
  if (setResult.error) throw new Error(`Catalog set lookup failed: ${setResult.error.message}`);
  if (productResult.error) throw new Error(`Catalog product lookup failed: ${productResult.error.message}`);

  const categoryRows = (categoryResult.data ?? []) as Array<{
    id: string;
    name: string;
    slug: string;
    active: boolean;
  }>;
  const setRows = (setResult.data ?? []) as Array<{
    id: string;
    category_id: string;
    name: string;
    code: string;
    active: boolean;
  }>;
  const categories: CatalogCategoryOption[] = categoryRows
    .filter((category) => category.active)
    .map(({ id, name, slug }) => ({ id, name, slug }));
  const sets: CatalogSetOption[] = setRows
    .filter((set) => set.active)
    .map((set) => ({ id: set.id, categoryId: set.category_id, name: set.name, code: set.code }));
  const products = (productResult.data ?? []) as unknown as ProductRow[];
  const liveProducts = products.filter((product) => product.active).length;
  const publishedProducts = products.filter((product) => product.listing_items?.[0]?.published).length;

  return (
    <div className="space-y-8">
      <PageHeader
        action={<StatusBadge tone="success">{staff.role}</StatusBadge>}
        eyebrow="Control"
        title="Catalog"
        description="Create products and maintain the catalog structure from one workspace."
      />

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Products" value={String(products.length)} detail={`${liveProducts} active`} />
        <MetricCard label="Categories" value={String(categoryRows.length)} detail={`${categories.length} active`} />
        <MetricCard label="Sets" value={String(setRows.length)} detail={`${sets.length} active`} />
        <MetricCard label="Published" value={String(publishedProducts)} detail="Visible storefront listings" />
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-zinc-950">Create product</h2>
            <p className="mt-1 text-sm text-zinc-600">
              Choose or add a category, then choose, add, or skip its set without leaving the form.
            </p>
          </div>
          <Link className="text-sm font-semibold text-emerald-700 hover:text-emerald-900" href="/control/listings">
            Storefront listings
          </Link>
        </div>
        <ProductIntakeForm categories={categories} sets={sets} />
      </section>

      <section className="grid gap-5 lg:grid-cols-2">
        <details className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
          <summary className="cursor-pointer text-lg font-semibold text-zinc-950">Quick add category</summary>
          <form action={upsertControlCategory} className="mt-5 grid gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Name" name="name" required />
              <Field label="Slug" name="slug" pattern="[a-z0-9]+(-[a-z0-9]+)*" required />
              <Field label="Publisher" name="publisher" />
              <Field label="Sort order" min="0" name="sortOrder" type="number" value="0" required />
            </div>
            <input name="parentId" type="hidden" value="" />
            <label className="grid gap-1 text-sm font-medium text-zinc-700">
              Description
              <textarea className={`${inputClass} min-h-24 py-2`} maxLength={2000} name="description" />
            </label>
            <input name="active" type="hidden" value="true" />
            <button className={primaryButtonClass}>Create category</button>
          </form>
        </details>

        <details className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
          <summary className="cursor-pointer text-lg font-semibold text-zinc-950">Quick add set</summary>
          <form action={upsertControlSet} className="mt-5 grid gap-4">
            <label className="grid gap-1 text-sm font-medium text-zinc-700">
              Category
              <select className={inputClass} name="categoryId" required>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Name" name="name" required />
              <Field label="Code" name="code" pattern="[A-Za-z0-9][A-Za-z0-9_-]{1,15}" required />
              <Field label="Release date" name="releaseDate" type="date" />
              <Field label="Sort order" min="0" name="sortOrder" type="number" value="0" required />
            </div>
            <label className="grid gap-1 text-sm font-medium text-zinc-700">
              Status
              <select className={inputClass} defaultValue="announced" name="status">
                <option value="announced">Announced</option>
                <option value="preorder_open">Preorder open</option>
                <option value="preorder_closed">Preorder closed</option>
                <option value="released">Released</option>
                <option value="out_of_print">Out of print</option>
              </select>
            </label>
            <input name="description" type="hidden" value="" />
            <input name="preorderOpenAt" type="hidden" value="" />
            <input name="preorderCloseAt" type="hidden" value="" />
            <input name="active" type="hidden" value="true" />
            <button className={primaryButtonClass} disabled={categories.length === 0}>
              Create set
            </button>
          </form>
        </details>
      </section>

      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-zinc-950">Recent products</h2>
          <div className="flex flex-wrap gap-4 text-sm font-semibold">
            <Link className="text-emerald-700 hover:text-emerald-900" href="/control/categories">
              Category details
            </Link>
            <Link className="text-emerald-700 hover:text-emerald-900" href="/control/sets">
              Set details
            </Link>
          </div>
        </div>
        {products.length === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-300 bg-white p-8 text-sm text-zinc-600">
            No products have been created.
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {products.map((product) => (
              <article key={product.id} className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate font-semibold text-zinc-950">{product.name}</h3>
                    <p className="mt-1 truncate text-xs text-zinc-500">/{product.slug}</p>
                  </div>
                  <StatusBadge tone={product.active ? "success" : "warning"}>
                    {product.active ? "Active" : "Archived"}
                  </StatusBadge>
                </div>
                <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                  <Data label="Category" value={product.tcg_categories?.name ?? "Unknown"} />
                  <Data
                    label="Set"
                    value={
                      product.sets_releases
                        ? `${product.sets_releases.name} (${product.sets_releases.code})`
                        : "None"
                    }
                  />
                  <Data label="Type" value={formatLabel(product.product_type)} />
                  <Data label="Language" value={product.language} />
                </dl>
                <div className="mt-5 flex items-center justify-between border-t border-zinc-100 pt-4 text-sm">
                  <span className="text-zinc-500">
                    {product.listing_items?.[0]?.published ? "Published" : "Not published"}
                  </span>
                  <Link className="font-semibold text-emerald-700 hover:text-emerald-900" href="/control/operations">
                    Edit
                  </Link>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Field({
  label,
  name,
  required = false,
  type = "text",
  value,
  pattern,
  min,
}: {
  label: string;
  name: string;
  required?: boolean;
  type?: string;
  value?: string;
  pattern?: string;
  min?: string;
}) {
  return (
    <label className="grid gap-1 text-sm font-medium text-zinc-700">
      {label}
      <input
        className={inputClass}
        defaultValue={value}
        min={min}
        name={name}
        pattern={pattern}
        required={required}
        type={type}
      />
    </label>
  );
}

function Data({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">{label}</dt>
      <dd className="mt-1 text-zinc-900">{value}</dd>
    </div>
  );
}

function formatLabel(value: string): string {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

const inputClass =
  "min-h-11 min-w-0 rounded-md border border-zinc-300 bg-white px-3 text-base text-zinc-950 sm:text-sm";
const primaryButtonClass =
  "min-h-11 rounded-md bg-zinc-950 px-4 text-sm font-semibold text-white hover:bg-emerald-700 disabled:bg-zinc-400";
