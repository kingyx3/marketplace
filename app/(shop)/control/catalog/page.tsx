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
  fetchControlProducts,
  type ControlProductRow,
} from "@/lib/control-catalog";
import {
  catalogProductNeedsAttention,
  catalogProductNextStep,
  matchesCatalogProduct,
  parseCatalogLifecycle,
  parseCatalogProductSort,
  parseCatalogPublication,
  parseCatalogReference,
  sortCatalogProducts,
  type CatalogLifecycleFilter,
  type CatalogProductSort,
  type CatalogPublicationFilter,
  type CatalogReferenceFilter,
} from "@/lib/control-catalog-view";
import { formatMoney } from "@/lib/money";
import { createSecretClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 24;

interface CatalogSearchParams {
  q?: string;
  lifecycle?: string;
  reference?: string;
  publication?: string;
  sort?: string;
  page?: string;
}

export default async function ControlCatalogPage({
  searchParams,
}: {
  searchParams?: Promise<CatalogSearchParams>;
}) {
  const { staff } = await requireControlPermission("catalog.view", "/control/catalog");
  const params = (await searchParams) ?? {};
  const query = (params.q ?? "").trim().slice(0, 160);
  const lifecycle = parseCatalogLifecycle(params.lifecycle);
  const reference = parseCatalogReference(params.reference);
  const publication = parseCatalogPublication(params.publication);
  const sort = parseCatalogProductSort(params.sort);
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const supabase = createSecretClient();
  const products = await fetchControlProducts(supabase);
  const matchingProducts = sortCatalogProducts(
    products.filter(
      (product) =>
        (lifecycle === "all" || (lifecycle === "active" ? product.active : !product.active)) &&
        (reference === "all" ||
          (reference === "assigned" ? Boolean(product.referenceCode) : !product.referenceCode)) &&
        (publication === "all" ||
          (publication === "published" ? product.published : !product.published)) &&
        matchesCatalogProduct(product, query)
    ),
    sort
  );
  const totalPages = Math.max(1, Math.ceil(matchingProducts.length / PAGE_SIZE));
  const normalizedFilters = { query, lifecycle, reference, publication, sort };
  if (page > totalPages) redirect(catalogPageHref(normalizedFilters, totalPages));
  const visibleProducts = matchingProducts.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const canManage = hasControlPermission(staff, "catalog.manage");
  const attentionCount = products.filter(catalogProductNeedsAttention).length;
  const unpricedCount = products.filter(
    (product) => product.active && product.priceCents <= 0
  ).length;
  const hasActiveFilters =
    Boolean(query) ||
    lifecycle !== "all" ||
    reference !== "all" ||
    publication !== "all" ||
    sort !== "attention";

  return (
    <div className="space-y-8">
      <PageHeader
        action={
          canManage ? (
            <PrimaryLink href="/control/catalog/products/new">Create product</PrimaryLink>
          ) : undefined
        }
        description="Find the exact product record, verify catalog identity and cross-domain readiness, then open it before making a change."
        eyebrow="Control"
        title="Catalog"
      />

      <nav aria-label="Catalog sections" className="flex flex-wrap gap-3">
        {canManage ? (
          <SectionLink href="/control/catalog/categories">Categories</SectionLink>
        ) : null}
        {canManage ? (
          <SectionLink href="/control/catalog/sets">Sets and releases</SectionLink>
        ) : null}
        {hasControlPermission(staff, "pricing.view") ? (
          <SectionLink href="/control/pricing">Pricing</SectionLink>
        ) : null}
        {hasControlPermission(staff, "storefront.view") ? (
          <SectionLink href="/control/storefront">Storefront</SectionLink>
        ) : null}
      </nav>

      {attentionCount > 0 ? (
        <section
          aria-labelledby="catalog-attention-title"
          className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-amber-300 bg-amber-50 p-5"
        >
          <div>
            <h2 className="font-semibold text-amber-950" id="catalog-attention-title">
              {attentionCount} active product{attentionCount === 1 ? "" : "s"} need a product
              reference
            </h2>
            <p className="mt-1 text-sm leading-6 text-amber-900">
              A product reference is Catalog-owned identity data and is required before Storefront
              can publish the product.
            </p>
          </div>
          <Link
            className="inline-flex min-h-11 items-center rounded-md border border-amber-400 bg-white px-4 text-sm font-semibold text-amber-950 hover:border-amber-600"
            href="/control/catalog?lifecycle=active&reference=missing"
          >
            {canManage ? "Assign product references" : "Review affected products"}
          </Link>
        </section>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Matching products"
          value={String(matchingProducts.length)}
          detail="Current search and filters"
        />
        <MetricCard
          label="Visible products"
          value={String(visibleProducts.length)}
          detail={`Page ${page} of ${totalPages} · latest 100 products`}
        />
        <MetricCard
          label="Catalog attention"
          value={String(attentionCount)}
          detail="Active products missing a reference"
        />
        <MetricCard
          label="Pricing attention"
          value={String(unpricedCount)}
          detail="Visible cross-domain dependency"
        />
      </section>

      <form className="grid gap-3 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm xl:grid-cols-[minmax(0,1fr)_10rem_11rem_11rem_12rem_auto]">
        <label className="grid gap-1 text-sm font-medium text-zinc-700">
          Search products
          <input
            className="min-h-11 rounded-md border border-zinc-300 px-3 text-base sm:text-sm"
            defaultValue={query}
            maxLength={160}
            name="q"
            placeholder="Name, product ID, slug, reference, barcode, or set"
          />
        </label>
        <label className="grid gap-1 text-sm font-medium text-zinc-700">
          Lifecycle
          <select
            className="min-h-11 rounded-md border border-zinc-300 px-3 text-base sm:text-sm"
            defaultValue={lifecycle}
            name="lifecycle"
          >
            <option value="all">All lifecycle</option>
            <option value="active">Active</option>
            <option value="archived">Archived</option>
          </select>
        </label>
        <label className="grid gap-1 text-sm font-medium text-zinc-700">
          Product reference
          <select
            className="min-h-11 rounded-md border border-zinc-300 px-3 text-base sm:text-sm"
            defaultValue={reference}
            name="reference"
          >
            <option value="all">All references</option>
            <option value="missing">Reference missing</option>
            <option value="assigned">Reference assigned</option>
          </select>
        </label>
        <label className="grid gap-1 text-sm font-medium text-zinc-700">
          Publication
          <select
            className="min-h-11 rounded-md border border-zinc-300 px-3 text-base sm:text-sm"
            defaultValue={publication}
            name="publication"
          >
            <option value="all">All publication</option>
            <option value="published">Published</option>
            <option value="unpublished">Not published</option>
          </select>
        </label>
        <label className="grid gap-1 text-sm font-medium text-zinc-700">
          Sort
          <select
            className="min-h-11 rounded-md border border-zinc-300 px-3 text-base sm:text-sm"
            defaultValue={sort}
            name="sort"
          >
            <option value="attention">Setup attention first</option>
            <option value="name">Product name</option>
            <option value="reference">Product reference</option>
            <option value="category">Category</option>
          </select>
        </label>
        <button className="min-h-11 self-end rounded-md bg-zinc-950 px-5 text-sm font-semibold text-white hover:bg-emerald-700">
          Apply
        </button>
      </form>

      {hasActiveFilters ? (
        <aside
          aria-label="Active catalog filters"
          className="flex flex-wrap items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-950"
        >
          <span className="font-semibold">Active filters:</span>
          {query ? <FilterChip>Search: “{query}”</FilterChip> : null}
          {lifecycle !== "all" ? <FilterChip>Lifecycle: {lifecycle}</FilterChip> : null}
          {reference !== "all" ? (
            <FilterChip>Reference: {referenceLabel(reference)}</FilterChip>
          ) : null}
          {publication !== "all" ? (
            <FilterChip>Publication: {publicationLabel(publication)}</FilterChip>
          ) : null}
          {sort !== "attention" ? <FilterChip>Sort: {sortLabel(sort)}</FilterChip> : null}
          <Link className="ml-auto font-semibold underline" href="/control/catalog">
            Clear all
          </Link>
        </aside>
      ) : null}

      {visibleProducts.length === 0 ? (
        <ControlEmptyState
          action={
            hasActiveFilters ? (
              <Link
                className="font-semibold text-emerald-700 hover:text-emerald-800"
                href="/control/catalog"
              >
                Clear filters
              </Link>
            ) : canManage ? (
              <PrimaryLink href="/control/catalog/products/new">Create product</PrimaryLink>
            ) : undefined
          }
          description={
            products.length === 0
              ? "Create the first catalog product to begin its guided listing workflow."
              : "Broaden the search or clear one of the lifecycle, reference, or publication filters."
          }
          title={
            products.length === 0 ? "No products have been created" : "No products match this view"
          }
        />
      ) : (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-zinc-950">Products</h2>
              <p className="mt-1 text-sm text-zinc-600">
                Product names lead; exact identifiers and cross-domain readiness remain visible
                before opening the record.
              </p>
            </div>
            <span className="text-sm text-zinc-500">
              {matchingProducts.length} result{matchingProducts.length === 1 ? "" : "s"} · page{" "}
              {page} of {totalPages}
            </span>
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            {visibleProducts.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        </section>
      )}

      {totalPages > 1 ? (
        <nav aria-label="Catalog product pages" className="flex items-center justify-between gap-3">
          <PaginationLink disabled={page <= 1} href={catalogPageHref(normalizedFilters, page - 1)}>
            Previous
          </PaginationLink>
          <span className="text-sm text-zinc-500">
            Page {page} of {totalPages}
          </span>
          <PaginationLink
            disabled={page >= totalPages}
            href={catalogPageHref(normalizedFilters, page + 1)}
          >
            Next
          </PaginationLink>
        </nav>
      ) : null}

      <p className="text-xs leading-5 text-zinc-500">
        Search, metrics, filters, and pagination operate over the latest 100 products. Use a direct
        product route for older records outside this bounded directory.
      </p>
    </div>
  );
}

function ProductCard({ product }: { product: ControlProductRow }) {
  return (
    <Link
      className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm transition hover:border-emerald-500 hover:shadow-md"
      href={`/control/catalog/products/${product.id}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="truncate font-semibold text-zinc-950">{product.name}</h3>
          <p className="mt-1 text-sm text-zinc-600">
            {[product.categoryName, product.setName, product.productType, product.language]
              .filter(Boolean)
              .join(" · ")}
          </p>
          <dl className="mt-3 grid gap-1 text-xs text-zinc-500">
            <Identifier label="Product ID" value={product.id} />
            <Identifier label="Slug" value={`/${product.slug}`} />
            <Identifier label="Product reference" value={product.referenceCode} />
            <Identifier label="Barcode" value={product.barcode} />
            <Identifier label="Set code" value={product.setCode} />
          </dl>
        </div>
        <div className="grid justify-items-end gap-2">
          <StatusBadge tone={product.active ? "success" : "warning"}>
            {product.active ? "Active" : "Archived"}
          </StatusBadge>
          <StatusBadge tone={product.published ? "info" : "neutral"}>
            {product.published ? "Published" : "Not published"}
          </StatusBadge>
          {!product.referenceCode ? (
            <StatusBadge tone="warning">Product reference required</StatusBadge>
          ) : null}
          <p className="font-mono text-xs text-zinc-400">
            System: {product.active ? "active" : "archived"} ·{" "}
            {product.published ? "published" : "unpublished"}
          </p>
        </div>
      </div>
      <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-4">
        <ControlData
          label="Current price"
          value={
            product.priceCents > 0
              ? formatMoney(product.priceCents, product.currency)
              : "Price required"
          }
        />
        <ControlData label="Category" value={product.categoryName ?? "Not assigned"} />
        <ControlData label="Set" value={product.setName ?? "Not assigned"} />
        <ControlData label="Next step" value={`${catalogProductNextStep(product)} →`} />
      </dl>
    </Link>
  );
}

function Identifier({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="inline font-medium">{label} </dt>
      <dd className="inline select-all break-all font-mono">{value ?? "Not assigned"}</dd>
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

function catalogPageHref(
  filters: {
    query: string;
    lifecycle: CatalogLifecycleFilter;
    reference: CatalogReferenceFilter;
    publication: CatalogPublicationFilter;
    sort: CatalogProductSort;
  },
  page: number
): string {
  const search = new URLSearchParams();
  if (filters.query) search.set("q", filters.query);
  if (filters.lifecycle !== "all") search.set("lifecycle", filters.lifecycle);
  if (filters.reference !== "all") search.set("reference", filters.reference);
  if (filters.publication !== "all") search.set("publication", filters.publication);
  if (filters.sort !== "attention") search.set("sort", filters.sort);
  if (page > 1) search.set("page", String(page));
  const value = search.toString();
  return value ? `/control/catalog?${value}` : "/control/catalog";
}

function referenceLabel(value: CatalogReferenceFilter): string {
  return value === "assigned" ? "Assigned" : "Missing";
}

function publicationLabel(value: CatalogPublicationFilter): string {
  return value === "published" ? "Published" : "Not published";
}

function sortLabel(value: CatalogProductSort): string {
  return {
    attention: "Setup attention first",
    name: "Product name",
    reference: "Product reference",
    category: "Category",
  }[value];
}

function PrimaryLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      className="inline-flex min-h-11 items-center rounded-md bg-zinc-950 px-4 text-sm font-semibold text-white hover:bg-emerald-700"
      href={href}
    >
      {children}
    </Link>
  );
}

function SectionLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      className="inline-flex min-h-11 items-center rounded-md border border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-800 hover:border-emerald-600 hover:text-emerald-700"
      href={href}
    >
      {children}
    </Link>
  );
}
