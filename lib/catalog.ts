import { hasSupabasePublicEnv } from "@/lib/env";
import { createPublishableClient, createSecretClient } from "@/lib/supabase";
import { toOne, type SupabaseToOne } from "@/lib/supabase-relations";

export type CatalogChannel = "b2c";

export interface CatalogProduct {
  id: string;
  referenceCode: string | null;
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
  priceCents: number;
  compareAtCents: number | null;
  currency: string;
  packsPerBox: number | null;
  cardsPerPack: number | null;
  onHand: number;
  allocated: number;
  safetyStock: number;
  available: number;
  incoming: number;
  preorderReserve: number;
  maxPerCustomer: number | null;
  tags: string[];
  channels: CatalogChannel[];
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
  reference_code: string | null;
  name: string;
  slug: string;
  product_type: string;
  description: string | null;
  image_url: string | null;
  language: string;
  price_cents: number;
  compare_at_cents: number | null;
  currency: string;
  packs_per_box: number | null;
  cards_per_pack: number | null;
  listing_items: SupabaseToOne<ListingItemRow>;
  tcg_categories: { name: string } | null;
  sets_releases: { name: string; code: string; status: string; release_date: string | null } | null;
  product_inventory: Array<{
    on_hand: number;
    allocated: number;
    safety_stock: number;
    available: number;
    incoming: number;
  }>;
}

const CATALOG_SELECT = `
  id,
  reference_code,
  name,
  slug,
  product_type,
  description,
  image_url,
  language,
  price_cents,
  compare_at_cents,
  currency,
  packs_per_box,
  cards_per_pack,
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
  sets_releases!products_set_belongs_to_category(name, code, status, release_date),
  product_inventory(on_hand, allocated, safety_stock, available, incoming)
`;

export async function getCatalogProducts(): Promise<CatalogProduct[] | null> {
  if (!hasSupabasePublicEnv()) return null;
  const { data, error } = await createPublishableClient()
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
  const { data, error } = await createPublishableClient()
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

export async function getProductQuote(
  items: Array<{ productId: string; quantity: number }>,
) {
  const productIds = items.map((item) => item.productId);
  if (productIds.length === 0) return { lines: [], subtotalCents: 0, currency: "SGD" };

  const { data, error } = await createSecretClient()
    .from("products")
    .select(
      "id, reference_code, name, slug, image_url, active, price_cents, currency, product_inventory(available, safety_stock)",
    )
    .in("id", productIds);
  if (error) throw new Error(`Cart quote failed: ${error.message}`);

  const rows = (data ?? []) as unknown as Array<{
    id: string;
    reference_code: string | null;
    name: string;
    slug: string;
    image_url: string | null;
    active: boolean;
    price_cents: number;
    currency: string;
    product_inventory: Array<{ available: number; safety_stock: number }>;
  }>;
  const byId = new Map(rows.map((row) => [row.id, row]));
  const lines = items.map((item) => {
    const product = byId.get(item.productId);
    if (!product?.active) throw new Error("A cart item is no longer available");
    return {
      productId: product.id,
      referenceCode: product.reference_code,
      name: product.name,
      slug: product.slug,
      imageUrl: product.image_url,
      quantity: item.quantity,
      available: product.product_inventory.reduce(
        (sum, inventory) => sum + Math.max(0, inventory.available - inventory.safety_stock),
        0,
      ),
      unitPriceCents: product.price_cents,
      lineTotalCents: product.price_cents * item.quantity,
      currency: product.currency,
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
  const listing = toOne(row.listing_items);
  const inventory = row.product_inventory ?? [];
  return {
    id: row.id,
    referenceCode: row.reference_code,
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
    priceCents: row.price_cents,
    compareAtCents: row.compare_at_cents,
    currency: row.currency,
    packsPerBox: row.packs_per_box,
    cardsPerPack: row.cards_per_pack,
    onHand: inventory.reduce((sum, item) => sum + item.on_hand, 0),
    allocated: inventory.reduce((sum, item) => sum + item.allocated, 0),
    safetyStock: inventory.reduce((sum, item) => sum + item.safety_stock, 0),
    available: inventory.reduce((sum, item) => sum + item.available, 0),
    incoming: inventory.reduce((sum, item) => sum + item.incoming, 0),
    preorderReserve: listing?.preorder_reserve ?? 0,
    maxPerCustomer: listing?.max_per_customer ?? null,
    tags: listing?.tags?.filter(Boolean) ?? [],
    channels: ["b2c"],
  };
}

function compareRows(a: ProductRow, b: ProductRow): number {
  const listingA = toOne(a.listing_items);
  const listingB = toOne(b.listing_items);
  const featured = Number(Boolean(listingB?.featured)) - Number(Boolean(listingA?.featured));
  if (featured !== 0) return featured;
  const priority = (listingA?.sort_priority ?? 0) - (listingB?.sort_priority ?? 0);
  return priority !== 0 ? priority : a.name.localeCompare(b.name);
}
