import Link from "next/link";

import { MetricCard } from "@/app/_components/metric-card";
import { PageHeader } from "@/app/_components/page-header";
import { StatusBadge } from "@/app/_components/status-badge";
import { hasControlPermission, requireControlPermission } from "@/lib/control-access";
import {
  fetchControlCategories,
  fetchControlProducts,
  fetchControlSets,
} from "@/lib/control-catalog";
import { createSecretClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function ControlCatalogPage() {
  const { staff } = await requireControlPermission("catalog.view", "/control/catalog");
  const supabase = createSecretClient();
  const [products, categories, sets] = await Promise.all([
    fetchControlProducts(supabase),
    fetchControlCategories(supabase),
    fetchControlSets(supabase),
  ]);
  const canManage = hasControlPermission(staff, "catalog.manage");
  const withoutSku = products.filter((product) => product.skus.length === 0).length;
  const unpriced = products.filter(
    (product) => product.skus.length > 0 && !product.skus.some((sku) => sku.priceCents > 0)
  ).length;

  return (
    <div className="space-y-8">
      <PageHeader
        action={
          canManage ? (
            <PrimaryLink href="/control/catalog/products/new">Create product</PrimaryLink>
          ) : undefined
        }
        description="Maintain product identity, taxonomy, media, and physical SKU definitions without changing price, stock, or publication."
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

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Products"
          value={String(products.length)}
          detail={`${products.filter((product) => product.active).length} active`}
        />
        <MetricCard
          label="Categories"
          value={String(categories.length)}
          detail="Catalog hierarchy"
        />
        <MetricCard label="Sets" value={String(sets.length)} detail="Releases" />
        <MetricCard
          label="Needs setup"
          value={String(withoutSku + unpriced)}
          detail={`${withoutSku} without SKU · ${unpriced} unpriced`}
        />
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white shadow-sm">
        <div className="border-b border-zinc-200 p-5">
          <h2 className="text-lg font-semibold text-zinc-950">Products</h2>
          <p className="mt-1 text-sm text-zinc-600">
            Open a product to continue its guided listing-readiness workflow.
          </p>
        </div>
        {products.length === 0 ? (
          <p className="p-6 text-sm text-zinc-500">No products have been created.</p>
        ) : (
          <div className="divide-y divide-zinc-100">
            {products.map((product) => (
              <Link
                className="grid gap-3 p-5 hover:bg-zinc-50 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                href={`/control/catalog/products/${product.id}`}
                key={product.id}
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold text-zinc-950">{product.name}</h3>
                    <StatusBadge tone={product.active ? "success" : "warning"}>
                      {product.active ? "Active" : "Archived"}
                    </StatusBadge>
                    {product.published ? <StatusBadge tone="info">Published</StatusBadge> : null}
                    {product.skus.length === 0 ? (
                      <StatusBadge tone="warning">SKU required</StatusBadge>
                    ) : null}
                    {product.skus.length > 0 && !product.skus.some((sku) => sku.priceCents > 0) ? (
                      <StatusBadge tone="warning">Price required</StatusBadge>
                    ) : null}
                  </div>
                  <p className="mt-1 text-sm text-zinc-600">
                    {[product.categoryName, product.setName, product.productType, product.language]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                <span className="text-sm font-semibold text-zinc-600">
                  {product.skus.length} SKU{product.skus.length === 1 ? "" : "s"} →
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function PrimaryLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      className="inline-flex min-h-10 items-center rounded-md bg-zinc-950 px-4 text-sm font-semibold text-white hover:bg-emerald-700"
      href={href}
    >
      {children}
    </Link>
  );
}

function SectionLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-800 hover:border-emerald-600 hover:text-emerald-700"
      href={href}
    >
      {children}
    </Link>
  );
}
