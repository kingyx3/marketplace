import Link from "next/link";
import { notFound } from "next/navigation";

import { CatalogProductDetailsEditor } from "@/app/(shop)/control/_components/catalog-product-details-editor";
import { CatalogSkuManager } from "@/app/(shop)/control/_components/catalog-product-editor";
import { PageHeader } from "@/app/_components/page-header";
import { StatusBadge } from "@/app/_components/status-badge";
import {
  fetchControlCategories,
  fetchControlProduct,
  fetchControlProductTypes,
  fetchControlSets,
} from "@/lib/control-catalog";
import { requireControlPermission } from "@/lib/control-access";
import { createServiceClient } from "@/lib/supabase";

type ControlProductPageProps = {
  params: Promise<{ productId: string }>;
};

export const dynamic = "force-dynamic";

export default async function ControlProductPage({ params }: ControlProductPageProps) {
  const { productId } = await params;
  await requireControlPermission(
    "manage_catalog",
    `/control/operations/products/${productId}`
  );
  const supabase = createServiceClient();
  const [product, categories, sets, productTypes] = await Promise.all([
    fetchControlProduct(productId, supabase),
    fetchControlCategories(supabase),
    fetchControlSets(supabase),
    fetchControlProductTypes(supabase),
  ]);

  if (!product) notFound();

  return (
    <div className="space-y-8">
      <PageHeader
        action={
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge tone={product.active ? "success" : "warning"}>
              {product.active ? "Active" : "Archived"}
            </StatusBadge>
            <BackLink href="/control/operations">Back to products</BackLink>
          </div>
        }
        description={`${product.categoryName ?? "Uncategorized"} · ${product.setName ?? "No set"} · ${product.productType} · ${product.language}`}
        eyebrow="Control · Product"
        title={product.name}
      />

      <section className="grid gap-4 sm:grid-cols-3">
        <Summary label="Slug" value={`/${product.slug}`} />
        <Summary
          label="Listing"
          value={product.published ? "Published" : "Not published"}
        />
        <Summary
          label="SKUs"
          value={`${product.skus.length} ${product.skus.length === 1 ? "SKU" : "SKUs"}`}
        />
      </section>

      <CatalogProductDetailsEditor
        categories={categories}
        product={product}
        productTypes={productTypes}
        sets={sets}
      />
      <CatalogSkuManager product={product} />
    </div>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-2 break-words font-semibold text-zinc-950">{value}</p>
    </div>
  );
}

function BackLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      className="inline-flex min-h-10 items-center justify-center rounded-md border border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-800 hover:border-emerald-600 hover:text-emerald-700"
      href={href}
    >
      {children}
    </Link>
  );
}
