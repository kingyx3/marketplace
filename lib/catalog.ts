import { hasSupabasePublicEnv } from "@/lib/env";
import { createAnonClient, createServiceClient } from "@/lib/supabase";

export type CatalogChannel = "b2c";

export interface CatalogSku {
  id: string;
  sku: string;
  active: boolean;
  priceCents: number;
  msrpCents: number | null;
  currency: string;
  packsPerBox: number | null;
  cardsPerPack: number | null;
  onHand: number;
  allocated: number;
  safetyStock: number;
  available: number;
  incoming: number;
}

export interface CatalogProduct {
  id: string;
  name: string;
  slug: string;
  productType: string;
  description: string | null;
  imageUrl: string | null;
  language: string;
  categoryName: string | null;
  setName: string | null;
  setCode: string | null;
  setStatus: string | null;
  releaseDate: string | null;
  preorderReserve: number;
  maxPerCustomer: number | null;
  tags: string[];
  channels: CatalogChannel[];
  skus: CatalogSku[];
}

interface ListingItemRow {
  title_override: string | null;
  tags: string[] | null;
  channels: string[] | null;
  max_per_customer: number | null;
  preorder_reserve: number | null;
  sort_priority: number | null;
  featured: boolean | null;
}

interface ProductRow {
  id: string;
  name: string;
  slug: string;
  product_type: string;
  description: string | null;
  image_url: string | null;
  language: string;
  listing_items: ListingItemRow[] | null;
  tcg_categories: { name: string } | null;
  sets_releases: { name: string; code: string; status: string; release_date: string | null } | null;
  product_variants: Array<{
    booster_box_skus: Array<{
      id: string;
      sku: string;
      active: boolean;
      packs_per_box: number | null;
      cards_per_pack: number | null;
      msrp_cents: number | null;
      price_cents: number;
      currency: string;
      inventory: Array<{
        on_hand: number;
        allocated: number;
        safety_stock: number;
        available: number;
        incoming: number;
      }>;
    }>;
  }>;
}

const CATALOG_SELECT = `
  id,
  name,
  slug,
  product_type,
  description,
  image_url,
  language,
  listing_items!inner(
    title_override,
    tags,
    channels,
    max_per_customer,
    preorder_reserve,
    sort_priority,
    featured
  ),
  tcg_categories(name),
  sets_releases(name, code, status, release_date),
  product_variants(
    booster_box_skus(
      id,
      sku,
      active,
      packs_per_box,
      cards_per_pack,
      msrp_cents,
      price_cents,
      currency,
      inventory(on_hand, allocated, safety_stock, available, incoming)
    )
  )
`;

export async function getCatalogProducts(): Promise<CatalogProduct[] | null> {
  if (!hasSupabasePublicEnv()) return null;
  const supabase = createAnonClient();
  const { data, error } = await supabase
    .from("products")
    .select(CATALOG_SELECT)
    .eq("active", true)
    .order("name")
    .limit(100);

  if (error) {
    console.error("catalog query failed:", error.message);
    return null;
  }

  return ((data ?? []) as unknown as ProductRow[]).sort(compareRows).map(mapProduct);
}

export async function getCatalogProduct(slug: string): Promise<CatalogProduct | null> {
  if (!hasSupabasePublicEnv()) return null;
  const supabase = createAnonClient();
  const { data, error } = await supabase
    .from("products")
    .select(CATALOG_SELECT)
    .eq("slug", slug)
    .eq("active", true)
    .maybeSingle();

  if (error) {
    console.error("product query failed:", error.message);
    return null;
  }

  return data ? mapProduct(data as unknown as ProductRow) : null;
}

export async function getSkuQuote(items: Array<{ skuId: string; quantity: number }>) {
  const supabase = createServiceClient();
  const skuIds = items.map((item) => item.skuId);
  if (skuIds.length === 0) return { lines: [], subtotalCents: 0, currency: "SGD" };

  const { data, error } = await supabase
    .from("booster_box_skus")
    .select(
      "id, sku, active, price_cents, currency, product_variants(products(name, slug, image_url, active)), inventory(available, incoming)"
    )
    .in("id", skuIds);

  if (error) throw new Error(`Cart quote failed: ${error.message}`);

  const rows = (data ?? []) as unknown as Array<{
    id: string;
    sku: string;
    active: boolean;
    price_cents: number;
    currency: string;
    product_variants: {
      products: { name: string; slug: string; image_url: string | null; active: boolean } | null;
    } | null;
    inventory: Array<{ available: number; incoming: number }>;
  }>;
  const bySku = new Map(rows.map((row) => [row.id, row]));
  const lines = items.map((item) => {
    const row = bySku.get(item.skuId);
    if (!row || !row.active || !row.product_variants?.products?.active) {
      throw new Error("A cart item is no longer available");
    }
    const product = row.product_variants.products;
    return {
      skuId: row.id,
      sku: row.sku,
      name: product.name,
      slug: product.slug,
      imageUrl: product.image_url,
      quantity: item.quantity,
      available: row.inventory.reduce((sum, inventory) => sum + inventory.available + inventory.incoming, 0),
      unitPriceCents: row.price_cents,
      lineTotalCents: row.price_cents * item.quantity,
      currency: row.currency,
    };
  });

  const currency = lines[0]?.currency ?? "SGD";
  if (lines.some((line) => line.currency !== currency)) {
    throw new Error("Mixed-currency carts are not supported");
  }

  return {
    lines,
    subtotalCents: lines.reduce((sum, line) => sum + line.lineTotalCents, 0),
    currency,
  };
}

function mapProduct(row: ProductRow): CatalogProduct {
  const listing = row.listing_items?.[0] ?? null;
  const skus = (row.product_variants ?? []).flatMap((variant) =>
    (variant.booster_box_skus ?? [])
      .filter((sku) => sku.active)
      .map((sku) => {
        const inventory = sku.inventory ?? [];
        return {
          id: sku.id,
          sku: sku.sku,
          active: sku.active,
          priceCents: sku.price_cents,
          msrpCents: sku.msrp_cents,
          currency: sku.currency,
          packsPerBox: sku.packs_per_box,
          cardsPerPack: sku.cards_per_pack,
          onHand: inventory.reduce((sum, item) => sum + item.on_hand, 0),
          allocated: inventory.reduce((sum, item) => sum + item.allocated, 0),
          safetyStock: inventory.reduce((sum, item) => sum + item.safety_stock, 0),
          available: inventory.reduce((sum, item) => sum + item.available, 0),
          incoming: inventory.reduce((sum, item) => sum + item.incoming, 0),
        };
      })
  );

  return {
    id: row.id,
    name: listing?.title_override ?? row.name,
    slug: row.slug,
    productType: row.product_type,
    description: row.description,
    imageUrl: row.image_url,
    language: row.language,
    categoryName: row.tcg_categories?.name ?? null,
    setName: row.sets_releases?.name ?? null,
    setCode: row.sets_releases?.code ?? null,
    setStatus: row.sets_releases?.status ?? null,
    releaseDate: row.sets_releases?.release_date ?? null,
    preorderReserve: listing?.preorder_reserve ?? 0,
    maxPerCustomer: listing?.max_per_customer ?? null,
    tags: listing?.tags?.filter(Boolean) ?? [],
    channels: ["b2c"],
    skus,
  };
}

function compareRows(a: ProductRow, b: ProductRow): number {
  const listingA = a.listing_items?.[0] ?? null;
  const listingB = b.listing_items?.[0] ?? null;
  const featured = Number(Boolean(listingB?.featured)) - Number(Boolean(listingA?.featured));
  if (featured !== 0) return featured;
  const priority = (listingA?.sort_priority ?? 0) - (listingB?.sort_priority ?? 0);
  if (priority !== 0) return priority;
  return a.name.localeCompare(b.name);
}
