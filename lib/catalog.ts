import { hasSupabasePublicEnv } from "@/lib/env";
import { createAnonClient, createServiceClient } from "@/lib/supabase";

export interface CatalogSku {
  id: string;
  sku: string;
  active: boolean;
  priceCents: number;
  currency: string;
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
  categoryName: string | null;
  setName: string | null;
  setCode: string | null;
  setStatus: string | null;
  releaseDate: string | null;
  skus: CatalogSku[];
}

interface ProductRow {
  id: string;
  name: string;
  slug: string;
  product_type: string;
  description: string | null;
  image_url: string | null;
  tcg_categories: { name: string } | null;
  sets_releases: { name: string; code: string; status: string; release_date: string | null } | null;
  product_variants: Array<{
    booster_box_skus: Array<{
      id: string;
      sku: string;
      active: boolean;
      price_cents: number;
      currency: string;
      inventory: Array<{ available: number; incoming: number }>;
    }>;
  }>;
}

export async function getCatalogProducts(): Promise<CatalogProduct[] | null> {
  if (!hasSupabasePublicEnv()) return null;
  const supabase = createAnonClient();
  const { data, error } = await supabase
    .from("products")
    .select(
      "id, name, slug, product_type, description, image_url, tcg_categories(name), sets_releases(name, code, status, release_date), product_variants(booster_box_skus(id, sku, active, price_cents, currency, inventory(available, incoming)))"
    )
    .eq("active", true)
    .order("name")
    .limit(100);

  if (error) {
    console.error("catalog query failed:", error.message);
    return null;
  }

  return ((data ?? []) as unknown as ProductRow[]).map(mapProduct);
}

export async function getCatalogProduct(slug: string): Promise<CatalogProduct | null> {
  if (!hasSupabasePublicEnv()) return null;
  const supabase = createAnonClient();
  const { data, error } = await supabase
    .from("products")
    .select(
      "id, name, slug, product_type, description, image_url, tcg_categories(name), sets_releases(name, code, status, release_date), product_variants(booster_box_skus(id, sku, active, price_cents, currency, inventory(available, incoming)))"
    )
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
  if (skuIds.length === 0) {
    return { lines: [], subtotalCents: 0, currency: "SGD" };
  }

  const { data, error } = await supabase
    .from("booster_box_skus")
    .select(
      "id, sku, active, price_cents, currency, product_variants(products(name, slug, image_url, active)), inventory(available, incoming)"
    )
    .in("id", skuIds);

  if (error) {
    throw new Error(`Cart quote failed: ${error.message}`);
  }

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
    const product = row.product_variants?.products;
    const available = row.inventory.reduce((sum, inv) => sum + inv.available + inv.incoming, 0);
    return {
      skuId: row.id,
      sku: row.sku,
      name: product?.name ?? row.sku,
      slug: product?.slug ?? "",
      imageUrl: product?.image_url ?? null,
      quantity: item.quantity,
      available,
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
  const skus = row.product_variants.flatMap((variant) =>
    variant.booster_box_skus
      .filter((sku) => sku.active)
      .map((sku) => ({
        id: sku.id,
        sku: sku.sku,
        active: sku.active,
        priceCents: sku.price_cents,
        currency: sku.currency,
        available: sku.inventory.reduce((sum, inv) => sum + inv.available, 0),
        incoming: sku.inventory.reduce((sum, inv) => sum + inv.incoming, 0),
      }))
  );

  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    productType: row.product_type,
    description: row.description,
    imageUrl: row.image_url,
    categoryName: row.tcg_categories?.name ?? null,
    setName: row.sets_releases?.name ?? null,
    setCode: row.sets_releases?.code ?? null,
    setStatus: row.sets_releases?.status ?? null,
    releaseDate: row.sets_releases?.release_date ?? null,
    skus,
  };
}
