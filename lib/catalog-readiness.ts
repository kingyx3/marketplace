export interface CatalogReadinessProduct {
  active: boolean;
  price_cents: number;
}

export function isSellableCatalogProduct(product: CatalogReadinessProduct): boolean {
  return product.active && Number.isInteger(product.price_cents) && product.price_cents > 0;
}
