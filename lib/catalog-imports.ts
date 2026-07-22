import { createSecretClient } from "@/lib/supabase";

export type CatalogImportProduct = {
  id: string;
  name: string;
  slug: string;
  referenceCode: string;
  barcode: string | null;
  language: string;
  productType: string;
  active: boolean;
  packsPerBox: number | null;
  cardsPerPack: number | null;
  weightGrams: number | null;
  priceCents: number;
  currency: string;
  providerVariantId: number | null;
};

export type CatalogImportConfirmation = {
  id: string;
  providerProductId: number;
  createdAt: string;
  products: CatalogImportProduct[];
};

type ImportRow = {
  id: string;
  provider_product_id: number;
  created_at: string;
  catalog_import_products: Array<{
    position: number;
    products: {
      id: string;
      name: string;
      slug: string;
      reference_code: string;
      barcode: string | null;
      language: string;
      product_type: string;
      active: boolean;
      packs_per_box: number | null;
      cards_per_pack: number | null;
      weight_grams: number | null;
      price_cents: number;
      currency: string;
      source_metadata: { variantId?: number } | null;
    } | null;
  }>;
};

export async function fetchCatalogImportConfirmation(
  importId: string,
): Promise<CatalogImportConfirmation | null> {
  const { data, error } = await createSecretClient()
    .from("catalog_imports")
    .select(`
      id,
      provider_product_id,
      created_at,
      catalog_import_products(
        position,
        products(
          id,
          name,
          slug,
          reference_code,
          barcode,
          language,
          product_type,
          active,
          packs_per_box,
          cards_per_pack,
          weight_grams,
          price_cents,
          currency,
          source_metadata
        )
      )
    `)
    .eq("id", importId)
    .maybeSingle();

  if (error) throw new Error(`Catalog import confirmation query failed: ${error.message}`);
  if (!data) return null;

  const row = data as unknown as ImportRow;
  const products = row.catalog_import_products
    .sort((a, b) => a.position - b.position)
    .flatMap(({ products: product }) =>
      product
        ? [{
            id: product.id,
            name: product.name,
            slug: product.slug,
            referenceCode: product.reference_code,
            barcode: product.barcode,
            language: product.language,
            productType: product.product_type,
            active: product.active,
            packsPerBox: product.packs_per_box,
            cardsPerPack: product.cards_per_pack,
            weightGrams: product.weight_grams,
            priceCents: product.price_cents,
            currency: product.currency,
            providerVariantId: product.source_metadata?.variantId ?? null,
          }]
        : [],
    );

  return {
    id: row.id,
    providerProductId: row.provider_product_id,
    createdAt: row.created_at,
    products,
  };
}

