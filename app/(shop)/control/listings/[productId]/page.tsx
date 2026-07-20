import { notFound } from "next/navigation";

import { ControlBackLink, ControlData } from "@/app/(shop)/control/_components/control-resource-ui";
import {
  ListingItemForm,
  type ListingItemRecord,
  type ListingProductRecord,
} from "@/app/(shop)/control/_components/listing-item-form";
import { PageHeader } from "@/app/_components/page-header";
import { StatusBadge } from "@/app/_components/status-badge";
import { requireControlPermission } from "@/lib/control-access";
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
  await requireControlPermission("manage_catalog", `/control/listings/${productId}`);
  const { data, error } = await createServiceClient()
    .from("products")
    .select(
      "id, name, slug, active, listing_items(id, title_override, badge_label, tags, max_per_customer, preorder_reserve, sort_priority, featured, published)"
    )
    .eq("id", productId)
    .maybeSingle();

  if (error) throw new Error(`Listing product lookup failed: ${error.message}`);
  if (!data) notFound();

  const product = data as unknown as ProductRow;
  const listing = one(product.listing_items);
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
            <ControlBackLink href="/control/listings">Back to listings</ControlBackLink>
          </>
        }
        description={`/${product.slug}`}
        eyebrow="Control · Listing"
        title={product.name}
      />

      {saved ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900" role="status">
          Storefront listing saved successfully.
        </div>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-3">
        <Summary label="Badge" value={listing?.badge_label || "Not set"} />
        <Summary label="Featured" value={listing?.featured ? "Yes" : "No"} />
        <Summary label="Priority" value={String(listing?.sort_priority ?? 0)} />
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6">
        <ListingItemForm listing={listing} product={product} />
      </section>
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
