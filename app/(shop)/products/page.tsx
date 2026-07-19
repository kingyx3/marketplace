import type { Metadata } from "next";

import { CatalogBrowser } from "@/app/(shop)/catalog/catalog-browser";
import { createCatalogFilterProduct } from "@/app/(shop)/catalog/catalog-filters";
import { DealCard } from "@/app/_components/deal-card";
import { PageHeader } from "@/app/_components/page-header";
import { ProductCard } from "@/app/_components/product-card";
import {
  getProduct,
  marketplaceProducts,
  type Channel,
  type MarketplaceProduct,
  type SetStatus,
} from "@/app/_data/marketplace-fixtures";
import { getCurrentViewer } from "@/lib/auth";
import { getStorefrontDeals } from "@/lib/deals";
import { hasSupabasePublicEnv } from "@/lib/env";
import { previewFixturesEnabled } from "@/lib/preview-fixtures";
import { getStorefrontAvailability } from "@/lib/storefront-availability";
import { indexBestDealsBySku } from "@/lib/storefront-deals";
import { createAnonClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Products",
  description: "Browse sealed products, preorders, and current sale prices.",
};

interface ListingItemRow {
  title_override: string | null;
  badge_label: string | null;
  tags: string[] | null;
  channels: Channel[] | null;
  max_per_customer: number | null;
  preorder_reserve: number | null;
  sort_priority: number | null;
  featured: boolean | null;
  published: boolean | null;
}

interface CatalogRow {
  id: string;
  name: string;
  slug: string;
  product_type: string;
  description: string | null;
  language: string;
  image_url: string | null;
  listing_items: ListingItemRow[] | null;
  sets_releases: {
    name: string;
    code: string;
    status: string;
    release_date: string | null;
  } | null;
  tcg_categories: {
    name: string;
    publisher: string | null;
  } | null;
  product_variants:
    | {
        booster_box_skus:
          | {
              sku: string;
              active: boolean;
              packs_per_box: number | null;
              cards_per_pack: number | null;
              msrp_cents: number | null;
              price_cents: number;
              currency: string;
              inventory:
                | {
                    on_hand: number;
                    incoming: number;
                    allocated: number;
                    safety_stock: number;
                  }[]
                | null;
            }[]
          | null;
      }[]
    | null;
}

type CatalogSource = "live" | "preview" | "unavailable";

function isSetStatus(value: string | undefined): value is SetStatus {
  return (
    value === "announced" ||
    value === "preorder_open" ||
    value === "preorder_closed" ||
    value === "released" ||
    value === "out_of_print"
  );
}

function normalizeRow(row: CatalogRow): MarketplaceProduct {
  const fixture = previewFixturesEnabled() ? getProduct(row.slug) : undefined;
  const listing = listingForRow(row);
  const sku = row.product_variants?.[0]?.booster_box_skus?.find((candidate) => candidate.active);
  const inventory = sku?.inventory ?? [];

  return {
    slug: row.slug,
    name: listing?.title_override ?? row.name,
    game: row.tcg_categories?.name ?? fixture?.game ?? "TCG",
    publisher: row.tcg_categories?.publisher ?? fixture?.publisher ?? "Publisher not specified",
    setName: row.sets_releases?.name ?? fixture?.setName ?? "Set pending",
    setCode: row.sets_releases?.code ?? fixture?.setCode ?? "TBD",
    releaseDate: row.sets_releases?.release_date ?? fixture?.releaseDate ?? "TBD",
    setStatus: isSetStatus(row.sets_releases?.status)
      ? row.sets_releases.status
      : (fixture?.setStatus ?? "announced"),
    productType: row.product_type.replaceAll("_", " "),
    sku: sku?.sku ?? fixture?.sku ?? row.id,
    language: row.language ?? fixture?.language ?? "EN",
    priceCents: sku?.price_cents ?? fixture?.priceCents ?? 0,
    msrpCents: sku?.msrp_cents ?? fixture?.msrpCents ?? null,
    currency: sku?.currency ?? fixture?.currency ?? "SGD",
    packsPerBox: sku?.packs_per_box ?? fixture?.packsPerBox ?? 0,
    cardsPerPack: sku?.cards_per_pack ?? fixture?.cardsPerPack ?? 0,
    onHand: inventory.reduce((sum, item) => sum + item.on_hand, 0) || fixture?.onHand || 0,
    incoming: inventory.reduce((sum, item) => sum + item.incoming, 0) || fixture?.incoming || 0,
    allocated: inventory.reduce((sum, item) => sum + item.allocated, 0) || fixture?.allocated || 0,
    safetyStock:
      inventory.reduce((sum, item) => sum + item.safety_stock, 0) || fixture?.safetyStock || 0,
    preorderReserve: listing?.preorder_reserve ?? fixture?.preorderReserve ?? 0,
    maxPerCustomer: listing?.max_per_customer ?? fixture?.maxPerCustomer ?? null,
    image: row.image_url ?? fixture?.image ?? "/images/sealed-tcg-hero.png",
    description: row.description ?? fixture?.description ?? "Sealed TCG product.",
    tags: listingTags(listing, fixture),
    channels: listingChannels(listing, fixture),
  };
}

async function fetchProducts(): Promise<{
  products: MarketplaceProduct[];
  source: CatalogSource;
}> {
  if (!hasSupabasePublicEnv()) {
    return previewFixturesEnabled()
      ? { products: marketplaceProducts, source: "preview" }
      : { products: [], source: "unavailable" };
  }

  const supabase = createAnonClient();
  const { data, error } = await supabase
    .from("products")
    .select(
      `
        id,
        name,
        slug,
        product_type,
        description,
        language,
        image_url,
        listing_items!inner(
          title_override,
          badge_label,
          tags,
          channels,
          max_per_customer,
          preorder_reserve,
          sort_priority,
          featured,
          published
        ),
        sets_releases(name, code, status, release_date),
        tcg_categories(name, publisher),
        product_variants(
          booster_box_skus(
            sku,
            active,
            packs_per_box,
            cards_per_pack,
            msrp_cents,
            price_cents,
            currency,
            inventory(on_hand, incoming, allocated, safety_stock)
          )
        )
      `
    )
    .eq("active", true)
    .order("name")
    .limit(50);

  if (error) {
    console.error("products query failed:", error.message);
    return previewFixturesEnabled()
      ? { products: marketplaceProducts, source: "preview" }
      : { products: [], source: "unavailable" };
  }

  const rows = (data ?? []) as unknown as CatalogRow[];
  return {
    products: rows.sort(compareCatalogRows).map(normalizeRow),
    source: "live",
  };
}

export default async function ProductsPage() {
  const viewer = await getCurrentViewer();
  const signedIn = Boolean(viewer.user);
  const [{ products, source }, deals] = await Promise.all([
    fetchProducts(),
    getStorefrontDeals({ signedIn, limit: 100 }),
  ]);
  const dealsBySku = indexBestDealsBySku(deals);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Products"
        title="Sealed products"
        description="Browse current stock, preorders, and sale prices in one place. Sold-out products remain visible for restock alerts."
      />

      {source === "unavailable" ? (
        <section
          aria-live="polite"
          className="rounded-lg border border-amber-200 bg-amber-50 p-8 text-center shadow-sm"
        >
          <h2 className="text-xl font-semibold text-amber-950">Products temporarily unavailable</h2>
          <p className="mt-2 text-sm text-amber-900">Please try again shortly.</p>
        </section>
      ) : products.length === 0 ? (
        <section className="rounded-lg border border-zinc-200 bg-white p-8 text-center shadow-sm">
          <h2 className="text-xl font-semibold text-zinc-950">No products available</h2>
          <p className="mt-2 text-sm text-zinc-600">Check back for the next release.</p>
        </section>
      ) : (
        <CatalogBrowser products={products.map(createCatalogFilterProduct)}>
          {products.map((product) => {
            const deal = dealsBySku.get(product.sku);
            const availability = getStorefrontAvailability(product);
            return deal ? (
              <DealCard availability={availability} key={product.slug} deal={deal} />
            ) : (
              <ProductCard key={product.slug} product={product} />
            );
          })}
        </CatalogBrowser>
      )}
    </div>
  );
}

function listingForRow(row: CatalogRow): ListingItemRow | null {
  return row.listing_items?.[0] ?? null;
}

function compareCatalogRows(a: CatalogRow, b: CatalogRow): number {
  const listingA = listingForRow(a);
  const listingB = listingForRow(b);
  const featured = Number(Boolean(listingB?.featured)) - Number(Boolean(listingA?.featured));
  if (featured !== 0) return featured;
  const priority = (listingA?.sort_priority ?? 0) - (listingB?.sort_priority ?? 0);
  if (priority !== 0) return priority;
  return a.name.localeCompare(b.name);
}

function listingTags(
  listing: ListingItemRow | null,
  fixture: MarketplaceProduct | undefined
): string[] {
  const tags = listing?.tags?.filter(Boolean) ?? [];
  const withBadge = listing?.badge_label ? [listing.badge_label, ...tags] : tags;
  return withBadge.length > 0 ? [...new Set(withBadge)] : (fixture?.tags ?? ["Sealed product"]);
}

function listingChannels(
  listing: ListingItemRow | null,
  fixture: MarketplaceProduct | undefined
): Channel[] {
  const channels = listing?.channels?.filter((channel): channel is Channel => channel === "b2c");
  return channels && channels.length > 0
    ? channels
    : (fixture?.channels.filter((channel) => channel === "b2c") ?? ["b2c"]);
}
