import { notFound } from "next/navigation";

import {
  ControlActionForm,
  ControlBackLink,
  ControlData,
  ControlSaveButton,
} from "@/app/(shop)/control/_components/control-resource-ui";
import {
  ListingItemForm,
  type ListingItemRecord,
  type ListingProductRecord,
} from "@/app/(shop)/control/_components/listing-item-form";
import { PageHeader } from "@/app/_components/page-header";
import { StatusBadge } from "@/app/_components/status-badge";
import { setListingPublished } from "@/app/actions/admin";
import { hasControlPermission, requireControlPermission } from "@/lib/control-access";
import { fetchControlProduct } from "@/lib/control-catalog";
import { createServiceClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

type ProductRow = ListingProductRecord & {
  listing_items: ListingItemRecord | ListingItemRecord[] | null;
};

export default async function ListingDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ productId: string }>;
  searchParams?: Promise<{ saved?: string }>;
}) {
  const { productId } = await params;
  const { staff } = await requireControlPermission(
    "storefront.view",
    `/control/storefront/listings/${productId}`
  );
  const { data, error } = await createServiceClient()
    .from("products")
    .select(
      "id, name, slug, active, listing_items(id, title_override, badge_label, tags, max_per_customer, preorder_reserve, sort_priority, featured, availability_mode, order_open_at, order_close_at, release_date, published)"
    )
    .eq("id", productId)
    .maybeSingle();

  if (error) throw new Error(`Listing product lookup failed: ${error.message}`);
  if (!data) notFound();

  const product = data as unknown as ProductRow;
  const listing = one(product.listing_items);
  const catalogProduct = await fetchControlProduct(productId, createServiceClient());
  const skuIds = catalogProduct?.skus.map((sku) => sku.skuId) ?? [];
  const inventoryResult = skuIds.length
    ? await createServiceClient()
        .from("inventory")
        .select("sku_id, available, safety_stock")
        .in("sku_id", skuIds)
    : { data: [], error: null };
  if (inventoryResult.error) {
    throw new Error(`Listing inventory readiness failed: ${inventoryResult.error.message}`);
  }
  const activeSkuReady = Boolean(catalogProduct?.skus.some((sku) => sku.skuActive));
  const priceReady = Boolean(
    catalogProduct?.skus.some((sku) => sku.skuActive && sku.priceCents > 0)
  );
  const availabilityReady = Boolean(listing?.availability_mode !== "unavailable");
  const stockReady =
    listing?.availability_mode !== "available_now" ||
    (inventoryResult.data ?? []).some((row) => row.available > row.safety_stock);
  const saved = (await searchParams)?.saved === "1";

  return (
    <div className="space-y-8">
      <PageHeader
        action={
          <>
            <StatusBadge tone={product.active ? "success" : "warning"}>
              {product.active ? "Product active" : "Product archived"}
            </StatusBadge>
            <StatusBadge tone={listing?.published ? "success" : "neutral"}>
              {listing?.published ? "Published" : "Not published"}
            </StatusBadge>
            <ControlBackLink href="/control/storefront/listings">Back to listings</ControlBackLink>
          </>
        }
        description={`/${product.slug}`}
        eyebrow="Control · Listing"
        title={product.name}
      />

      {saved ? (
        <div
          className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900"
          role="status"
        >
          Storefront listing saved successfully.
        </div>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-3">
        <Summary label="Badge" value={listing?.badge_label || "Not set"} />
        <Summary
          label="Availability"
          value={(listing?.availability_mode ?? "unavailable").replaceAll("_", " ")}
        />
        <Summary label="Release" value={listing?.release_date ?? "Not scheduled"} />
      </section>

      {hasControlPermission(staff, "storefront.manage") ? (
        <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6">
          <ListingItemForm listing={listing} product={product} />
        </section>
      ) : (
        <section className="rounded-xl border border-zinc-200 bg-white p-5 text-sm leading-6 text-zinc-600 shadow-sm">
          This listing is read only for your current domain coverage.
        </section>
      )}

      <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold text-zinc-950">Readiness review and publication</h2>
            <p className="mt-1 text-sm leading-6 text-zinc-600">
              Publication is a separate approval. The database rechecks every requirement when the
              decision is saved.
            </p>
          </div>
          <StatusBadge tone={listing?.published ? "success" : "neutral"}>
            {listing?.published ? "Published" : "Not published"}
          </StatusBadge>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <Readiness label="Product active" ready={product.active} />
          <Readiness label="Physical SKU" ready={activeSkuReady} />
          <Readiness label="Current price" ready={priceReady} />
          <Readiness label="Availability" ready={availabilityReady} />
          <Readiness label="Sellable stock" ready={stockReady} />
        </div>
        {hasControlPermission(staff, "storefront.publish") ? (
          <ControlActionForm
            action={setListingPublished}
            className="mt-5"
            confirmation={{
              title: listing?.published ? "Unpublish listing?" : "Publish listing?",
              description: listing?.published
                ? "Customers will no longer be able to discover or order this listing. Existing orders are unaffected."
                : "This makes the listing customer-facing. Product, SKU, price, supply, and availability readiness will be checked again on the server.",
              confirmLabel: listing?.published ? "Unpublish listing" : "Approve and publish",
              tone: listing?.published ? "danger" : "default",
            }}
            errorMessage="Publication could not be changed. Review every readiness requirement and try again."
            successMessage={listing?.published ? "Listing unpublished." : "Listing published."}
          >
            <input name="productId" type="hidden" value={product.id} />
            <input name="published" type="hidden" value={listing?.published ? "false" : "true"} />
            <ControlSaveButton pendingLabel={listing?.published ? "Unpublishing…" : "Publishing…"}>
              {listing?.published ? "Unpublish listing" : "Approve and publish"}
            </ControlSaveButton>
          </ControlActionForm>
        ) : (
          <p className="mt-5 text-sm text-zinc-500">
            Final publication requires the Publish listings permission.
          </p>
        )}
      </section>
    </div>
  );
}

function Readiness({ label, ready }: { label: string; ready: boolean }) {
  return (
    <div className="rounded-lg border border-zinc-200 p-3">
      <p className="text-xs font-medium text-zinc-500">{label}</p>
      <p className={`mt-1 text-sm font-semibold ${ready ? "text-emerald-700" : "text-amber-700"}`}>
        {ready ? "Ready" : "Required"}
      </p>
    </div>
  );
}

function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function Summary({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
      <ControlData label={label} value={value} />
    </div>
  );
}
