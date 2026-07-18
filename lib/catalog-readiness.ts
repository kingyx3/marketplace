export interface CatalogReadinessSku {
  active: boolean;
  price_cents: number;
}

export interface CatalogReadinessVariant {
  booster_box_skus: CatalogReadinessSku[] | null;
}

export interface CatalogReadinessProduct {
  product_variants: CatalogReadinessVariant[] | null;
}

export function hasSellableCatalogSku(product: CatalogReadinessProduct): boolean {
  return Boolean(
    product.product_variants?.some((variant) =>
      variant.booster_box_skus?.some(
        (sku) => sku.active && Number.isInteger(sku.price_cents) && sku.price_cents > 0
      )
    )
  );
}
