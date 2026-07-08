import { PageHeader } from "@/app/_components/page-header";
import { ProductCard } from "@/app/_components/product-card";
import { StatusBadge } from "@/app/_components/status-badge";
import {
  getProduct,
  marketplaceProducts,
  type Channel,
  type MarketplaceProduct,
  type SetStatus,
} from "@/app/_data/marketplace-fixtures";
import { hasSupabasePublicEnv } from "@/lib/env";
import { getCurrentUser, getCustomerProfile } from "@/lib/auth";
import { getWholesaleAccess, wholesaleIsActive, type WholesaleAccess } from "@/lib/b2b";
import { createAnonClient } from "@/lib/supabase";
import { createServiceClient } from "@/lib/supabase";

// Always render at request time: the catalog reads live inventory and
// must not be frozen into the build. It also builds without DB creds.
export const dynamic = "force-dynamic";

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

interface CatalogHeaderConfig {
  eyebrow: string;
  title: string;
  description: string;
  emptyTitle: string;
  emptyDescription: string;
}

const DEFAULT_CATALOG_HEADER: CatalogHeaderConfig = {
  eyebrow: "Catalog",
  title: "Sealed product inventory",
  description:
    "Browse active booster boxes, collector boxes, cases, and preorders with visible stock and allocation limits.",
  emptyTitle: "No active products",
  emptyDescription: "Publish a listing item before opening orders.",
};

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
  const fixture = getProduct(row.slug);
  const listing = listingForRow(row);
  const sku = row.product_variants?.[0]?.booster_box_skus?.find((candidate) => candidate.active);
  const inventory = sku?.inventory?.[0];

  return {
    slug: row.slug,
    name: listing?.title_override ?? row.name,
    game: row.tcg_categories?.name ?? fixture?.game ?? "TCG",
    publisher: row.tcg_categories?.publisher ?? fixture?.publisher ?? "Publisher",
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
    onHand: inventory?.on_hand ?? fixture?.onHand ?? 0,
    incoming: inventory?.incoming ?? fixture?.incoming ?? 0,
    allocated: inventory?.allocated ?? fixture?.allocated ?? 0,
    safetyStock: inventory?.safety_stock ?? fixture?.safetyStock ?? 0,
    preorderReserve: listing?.preorder_reserve ?? fixture?.preorderReserve ?? 0,
    maxPerCustomer: listing?.max_per_customer ?? fixture?.maxPerCustomer ?? null,
    image: row.image_url ?? fixture?.image ?? "/images/sealed-tcg-hero.png",
    description: row.description ?? fixture?.description ?? "Sealed TCG product.",
    tags: listingTags(listing, fixture),
    channels: listingChannels(listing, fixture),
  };
}

async function fetchProducts(): Promise<{ products: MarketplaceProduct[]; source: "live" | "preview" }> {
  if (!hasSupabasePublicEnv()) return { products: marketplaceProducts, source: "preview" };

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
    console.error("catalog query failed:", error.message);
    return { products: marketplaceProducts, source: "preview" };
  }

  const rows = (data ?? []) as unknown as CatalogRow[];
  return {
    products: rows.sort(compareCatalogRows).map(normalizeRow),
    source: "live",
  };
}

async function fetchCatalogHeader(): Promise<CatalogHeaderConfig> {
  if (!hasSupabasePublicEnv()) return DEFAULT_CATALOG_HEADER;

  const supabase = createAnonClient();
  const { data, error } = await supabase
    .from("storefront_configurations")
    .select("value")
    .eq("key", "catalog_header")
    .eq("active", true)
    .maybeSingle();

  if (error) {
    console.error("catalog header configuration query failed:", error.message);
    return DEFAULT_CATALOG_HEADER;
  }

  const value = (data?.value ?? {}) as Record<string, unknown>;
  return {
    eyebrow: configString(value, "eyebrow", DEFAULT_CATALOG_HEADER.eyebrow),
    title: configString(value, "title", DEFAULT_CATALOG_HEADER.title),
    description: configString(value, "description", DEFAULT_CATALOG_HEADER.description),
    emptyTitle: configString(value, "emptyTitle", DEFAULT_CATALOG_HEADER.emptyTitle),
    emptyDescription: configString(
      value,
      "emptyDescription",
      DEFAULT_CATALOG_HEADER.emptyDescription
    ),
  };
}

export default async function CatalogPage() {
  const [{ products, source }, header] = await Promise.all([fetchProducts(), fetchCatalogHeader()]);
  const wholesaleAccess = await currentWholesaleAccess();

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={header.eyebrow}
        title={header.title}
        description={header.description}
        action={<StatusBadge tone={source === "live" ? "success" : "warning"}>{source} data</StatusBadge>}
      />

      <section className="grid gap-3 rounded-lg border border-zinc-200 bg-white p-4 shadow-sm md:grid-cols-[1fr_12rem_12rem_10rem]">
        <label className="grid gap-2 text-sm font-medium text-zinc-700">
          Search
          <input
            className="min-h-11 rounded-md border border-zinc-300 px-3 text-sm outline-none focus:border-emerald-600"
            placeholder="Set, game, SKU"
            type="search"
          />
        </label>
        <label className="grid gap-2 text-sm font-medium text-zinc-700">
          Game
          <select className="min-h-11 rounded-md border border-zinc-300 px-3 text-sm outline-none focus:border-emerald-600">
            <option>All games</option>
            <option>Magic</option>
            <option>Pokemon</option>
            <option>One Piece</option>
            <option>Lorcana</option>
          </select>
        </label>
        <label className="grid gap-2 text-sm font-medium text-zinc-700">
          Status
          <select className="min-h-11 rounded-md border border-zinc-300 px-3 text-sm outline-none focus:border-emerald-600">
            <option>All status</option>
            <option>Preorder open</option>
            <option>Released</option>
            <option>Announced</option>
          </select>
        </label>
        <div className="grid content-end">
          <button className="min-h-11 rounded-md bg-zinc-950 px-4 text-sm font-semibold text-white hover:bg-emerald-700">
            Apply
          </button>
        </div>
      </section>

      {products.length === 0 ? (
        <section className="rounded-lg border border-zinc-200 bg-white p-8 text-center shadow-sm">
          <h2 className="text-xl font-semibold text-zinc-950">{header.emptyTitle}</h2>
          <p className="mt-3 text-sm text-zinc-600">{header.emptyDescription}</p>
        </section>
      ) : (
        <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {products.map((product) => (
            <ProductCard
              key={product.slug}
              product={product}
              sourceLabel={source === "live" ? "Live" : "Preview"}
              wholesaleAccess={wholesaleAccess}
            />
          ))}
        </section>
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
  return withBadge.length > 0 ? [...new Set(withBadge)] : (fixture?.tags ?? ["Live catalog"]);
}

function listingChannels(
  listing: ListingItemRow | null,
  fixture: MarketplaceProduct | undefined
): Channel[] {
  const channels = listing?.channels?.filter((channel): channel is Channel => {
    return channel === "b2c" || channel === "b2b";
  });
  return channels && channels.length > 0 ? channels : (fixture?.channels ?? ["b2c"]);
}

function configString(config: Record<string, unknown>, key: string, fallback: string): string {
  const value = config[key];
  return typeof value === "string" && value.trim() ? value : fallback;
}

async function currentWholesaleAccess(): Promise<WholesaleAccess | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  const customer = await getCustomerProfile(user.id);
  if (!customer) return null;

  try {
    const access = await getWholesaleAccess(createServiceClient(), customer.id);
    return wholesaleIsActive(access) ? access : null;
  } catch (error) {
    console.error("wholesale pricing lookup failed:", safeError(error));
    return null;
  }
}

function safeError(error: unknown): string {
  return error instanceof Error ? error.message : "unknown";
}
