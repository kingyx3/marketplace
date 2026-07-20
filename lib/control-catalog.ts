import {
  type CatalogCategoryOption,
  type CatalogProductTypeOption,
  type CatalogSetOption,
} from "@/app/(shop)/control/_components/product-intake-form";
import { createServiceClient } from "@/lib/supabase";
import { toOne, type SupabaseToOne } from "@/lib/supabase-relations";

export interface ControlCatalogSku {
  skuId: string;
  sku: string;
  skuActive: boolean;
  barcode: string | null;
  packsPerBox: number | null;
  cardsPerPack: number | null;
  msrpCents: number | null;
  priceCents: number;
  currency: string;
  weightGrams: number | null;
  productId: string;
  productName: string;
}

export interface ControlProductRow {
  id: string;
  categoryId: string;
  categoryName: string | null;
  setId: string;
  setName: string | null;
  setCode: string | null;
  slug: string;
  name: string;
  productType: string;
  description: string | null;
  language: string;
  imageUrl: string | null;
  active: boolean;
  published: boolean;
  skus: ControlCatalogSku[];
}

export interface ControlCategoryOption extends CatalogCategoryOption {
  active: boolean;
}

export interface ControlSetOption extends CatalogSetOption {
  active: boolean;
}

export interface ControlProductTypeOption extends CatalogProductTypeOption {
  active: boolean;
}

interface ProductQueryRow {
  id: string;
  category_id: string;
  set_id: string;
  slug: string;
  name: string;
  product_type: string;
  description: string | null;
  language: string;
  image_url: string | null;
  active: boolean;
  listing_items: SupabaseToOne<{ published: boolean }>;
  tcg_categories: { name: string } | null;
  sets_releases: { name: string; code: string } | null;
  product_variants: Array<{
    booster_box_skus: Array<{
      id: string;
      sku: string;
      active: boolean;
      barcode: string | null;
      packs_per_box: number | null;
      cards_per_pack: number | null;
      msrp_cents: number | null;
      price_cents: number;
      currency: string;
      weight_grams: number | null;
    }>;
  }>;
}

const CONTROL_PRODUCT_SELECT = `
  id,
  category_id,
  set_id,
  slug,
  name,
  product_type,
  description,
  language,
  image_url,
  active,
  listing_items(published),
  tcg_categories(name),
  sets_releases(name, code),
  product_variants(
    booster_box_skus(
      id,
      sku,
      active,
      barcode,
      packs_per_box,
      cards_per_pack,
      msrp_cents,
      price_cents,
      currency,
      weight_grams
    )
  )
`;

export async function fetchControlProducts(
  supabase = createServiceClient()
): Promise<ControlProductRow[]> {
  const { data, error } = await supabase
    .from("products")
    .select(CONTROL_PRODUCT_SELECT)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) throw new Error(`Control product query failed: ${error.message}`);
  return ((data ?? []) as unknown as ProductQueryRow[]).map(mapProduct);
}

export async function fetchControlProduct(
  productId: string,
  supabase = createServiceClient()
): Promise<ControlProductRow | null> {
  const { data, error } = await supabase
    .from("products")
    .select(CONTROL_PRODUCT_SELECT)
    .eq("id", productId)
    .maybeSingle();

  if (error) throw new Error(`Control product detail query failed: ${error.message}`);
  return data ? mapProduct(data as unknown as ProductQueryRow) : null;
}

export async function fetchControlCategories(
  supabase = createServiceClient()
): Promise<ControlCategoryOption[]> {
  const { data, error } = await supabase
    .from("tcg_categories")
    .select("id, name, slug, active")
    .order("name");

  if (error) throw new Error(`Category option query failed: ${error.message}`);
  return ((data ?? []) as Array<{ id: string; name: string; slug: string; active: boolean }>).map(
    (row) => ({ id: row.id, name: row.name, slug: row.slug, active: row.active })
  );
}

export async function fetchControlSets(
  supabase = createServiceClient()
): Promise<ControlSetOption[]> {
  const { data, error } = await supabase
    .from("sets_releases")
    .select("id, category_id, name, code, active")
    .order("release_date", { ascending: false });

  if (error) throw new Error(`Set option query failed: ${error.message}`);
  return (
    (data ?? []) as Array<{
      id: string;
      category_id: string;
      name: string;
      code: string;
      active: boolean;
    }>
  ).map((row) => ({
    id: row.id,
    categoryId: row.category_id,
    name: row.name,
    code: row.code,
    active: row.active,
  }));
}

export async function fetchControlProductTypes(
  supabase = createServiceClient()
): Promise<ControlProductTypeOption[]> {
  const { data, error } = await supabase
    .from("product_types")
    .select("code, name, active")
    .order("sort_order")
    .order("name");

  if (error) throw new Error(`Product type option query failed: ${error.message}`);
  return ((data ?? []) as Array<{ code: string; name: string; active: boolean }>).map((row) => ({
    code: row.code,
    name: row.name,
    active: row.active,
  }));
}

function mapProduct(row: ProductQueryRow): ControlProductRow {
  const listing = toOne(row.listing_items);
  const skus = (row.product_variants ?? []).flatMap((variant) =>
    (variant.booster_box_skus ?? []).map((sku) => ({
      skuId: sku.id,
      sku: sku.sku,
      skuActive: sku.active,
      barcode: sku.barcode,
      packsPerBox: sku.packs_per_box,
      cardsPerPack: sku.cards_per_pack,
      msrpCents: sku.msrp_cents,
      priceCents: sku.price_cents,
      currency: sku.currency,
      weightGrams: sku.weight_grams,
      productId: row.id,
      productName: row.name,
    }))
  );

  return {
    id: row.id,
    categoryId: row.category_id,
    categoryName: row.tcg_categories?.name ?? null,
    setId: row.set_id,
    setName: row.sets_releases?.name ?? null,
    setCode: row.sets_releases?.code ?? null,
    slug: row.slug,
    name: row.name,
    productType: row.product_type,
    description: row.description,
    language: row.language,
    imageUrl: row.image_url,
    active: row.active,
    published: Boolean(listing?.published),
    skus,
  };
}
