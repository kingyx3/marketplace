import Link from "next/link";
import { notFound } from "next/navigation";

import { CatalogProductDetailsEditor as CatalogProductEditor } from "@/app/(shop)/control/_components/catalog-product-details-editor";
import { ProductListingWorkflow } from "@/app/(shop)/control/_components/product-listing-workflow";
import { PageHeader } from "@/app/_components/page-header";
import { StatusBadge } from "@/app/_components/status-badge";
import {
  fetchControlCategories,
  fetchControlProduct,
  fetchControlProductTypes,
  fetchControlSets,
} from "@/lib/control-catalog";
import { hasControlPermission, requireControlPermission } from "@/lib/control-access";
import { createSecretClient } from "@/lib/supabase";

type ControlProductPageProps = {
  params: Promise<{ productId: string }>;
};

export const dynamic = "force-dynamic";

export default async function ControlProductPage({ params }: ControlProductPageProps) {
  const { productId } = await params;
  const { staff } = await requireControlPermission(
    "catalog.view",
    `/control/catalog/products/${productId}`
  );
  const supabase = createSecretClient();
  const [product, categories, sets, productTypes, listingResult] = await Promise.all([
    fetchControlProduct(productId, supabase),
    fetchControlCategories(supabase),
    fetchControlSets(supabase),
    fetchControlProductTypes(supabase),
    supabase
      .from("listing_items")
      .select("id, availability_mode, published")
      .eq("product_id", productId)
      .maybeSingle(),
  ]);

  if (!product) notFound();
  if (listingResult.error)
    throw new Error(`Listing readiness query failed: ${listingResult.error.message}`);

  const inventoryResult = await supabase
    .from("product_inventory")
    .select("product_id, on_hand, incoming")
    .eq("product_id", productId);
  if (inventoryResult.error)
    throw new Error(`Supply readiness query failed: ${inventoryResult.error.message}`);

  const hasSellableProduct = product.active && product.priceCents > 0;
  const storefrontStatus = !product.published
    ? "Not published"
    : !product.active
      ? "Published · product archived"
      : !hasSellableProduct
        ? "Published · positive price required"
        : "Visible";

  return (
    <div className="space-y-8">
      <PageHeader
        action={
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge tone={product.active ? "success" : "warning"}>
              {product.active ? "Active" : "Archived"}
            </StatusBadge>
            <BackLink href="/control/catalog">Back to products</BackLink>
          </div>
        }
        description={`${product.categoryName ?? "Uncategorized"} · ${product.setName ?? "No set"} · ${product.productType} · ${product.language}`}
        eyebrow="Control · Product"
        title={product.name}
      />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Summary label="Slug" value={`/${product.slug}`} />
        <Summary label="Publication" value={product.published ? "Published" : "Not published"} />
        <Summary label="Storefront" value={storefrontStatus} />
        <Summary label="Reference" value={product.referenceCode ?? "Not assigned"} />
      </section>

      <ProductListingWorkflow
        listingComplete={Boolean(
          listingResult.data?.id && listingResult.data.availability_mode !== "unavailable"
        )}
        pricingComplete={product.priceCents > 0}
        productComplete={Boolean(
          product.active && product.name && product.categoryId && product.setId
        )}
        productId={product.id}
        published={Boolean(listingResult.data?.published)}
        staff={staff}
        supplyComplete={(inventoryResult.data ?? []).some(
          (row) => row.on_hand > 0 || row.incoming > 0
        )}
      />

      {hasControlPermission(staff, "catalog.manage") ? (
        <>
          <CatalogProductEditor
            categories={categories}
            product={product}
            productTypes={productTypes}
            sets={sets}
          />
        </>
      ) : (
        <p className="rounded-xl border border-zinc-200 bg-white p-5 text-sm text-zinc-600">
          You have read-only catalog access.
        </p>
      )}
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
