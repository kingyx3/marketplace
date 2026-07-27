import type { ControlProductRow } from "@/lib/control-catalog";

export type CatalogLifecycleFilter = "all" | "active" | "archived";
export type CatalogReferenceFilter = "all" | "missing" | "assigned";
export type CatalogPublicationFilter = "all" | "published" | "unpublished";
export type CatalogProductSort = "attention" | "name" | "reference" | "category";

export function parseCatalogLifecycle(value?: string): CatalogLifecycleFilter {
  return value === "active" || value === "archived" ? value : "all";
}

export function parseCatalogReference(value?: string): CatalogReferenceFilter {
  return value === "missing" || value === "assigned" ? value : "all";
}

export function parseCatalogPublication(value?: string): CatalogPublicationFilter {
  return value === "published" || value === "unpublished" ? value : "all";
}

export function parseCatalogProductSort(value?: string): CatalogProductSort {
  return value === "name" || value === "reference" || value === "category" ? value : "attention";
}

export function catalogProductNeedsAttention(product: ControlProductRow): boolean {
  return product.active && !product.referenceCode;
}

export function matchesCatalogProduct(product: ControlProductRow, query: string): boolean {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;
  return [
    product.name,
    product.id,
    product.slug,
    product.referenceCode,
    product.barcode,
    product.categoryName,
    product.setName,
    product.setCode,
    product.productType,
    product.language,
  ].some((value) => value?.toLowerCase().includes(normalized));
}

export function sortCatalogProducts(
  products: ControlProductRow[],
  sort: CatalogProductSort
): ControlProductRow[] {
  return [...products].sort((left, right) => {
    if (sort === "name") return left.name.localeCompare(right.name);
    if (sort === "reference") {
      return (left.referenceCode ?? "\uffff").localeCompare(right.referenceCode ?? "\uffff");
    }
    if (sort === "category") {
      return (
        (left.categoryName ?? "\uffff").localeCompare(right.categoryName ?? "\uffff") ||
        left.name.localeCompare(right.name)
      );
    }
    return catalogPriority(left) - catalogPriority(right);
  });
}

export function catalogProductNextStep(product: ControlProductRow): string {
  if (!product.active) return "Review archived record";
  if (!product.referenceCode) return "Add product reference";
  if (product.priceCents <= 0) return "Continue to Pricing";
  if (!product.published) return "Continue readiness review";
  return "Review product";
}

function catalogPriority(product: ControlProductRow): number {
  if (catalogProductNeedsAttention(product)) return 0;
  if (product.active && product.priceCents <= 0) return 1;
  if (product.active && !product.published) return 2;
  if (product.active) return 3;
  return 4;
}
