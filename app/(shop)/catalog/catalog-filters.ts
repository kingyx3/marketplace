import type { MarketplaceProduct, SetStatus } from "@/app/_data/marketplace-fixtures";

export const ALL_CATALOG_FILTERS = "all" as const;

export type CatalogStatusFilter = typeof ALL_CATALOG_FILTERS | SetStatus;

export interface CatalogFilterProduct {
  slug: string;
  name: string;
  game: string;
  publisher: string;
  setName: string;
  setCode: string;
  setStatus: SetStatus;
  productType: string;
  referenceCode: string;
  language: string;
  description: string;
  tags: string[];
}

export interface CatalogFilters {
  query: string;
  game: string;
  status: CatalogStatusFilter;
}

const STATUS_ORDER: SetStatus[] = [
  "preorder_open",
  "released",
  "announced",
  "preorder_closed",
  "out_of_print",
];

export const EMPTY_CATALOG_FILTERS: CatalogFilters = {
  query: "",
  game: ALL_CATALOG_FILTERS,
  status: ALL_CATALOG_FILTERS,
};

export function createCatalogFilterProduct(product: MarketplaceProduct): CatalogFilterProduct {
  return {
    slug: product.slug,
    name: product.name,
    game: product.game,
    publisher: product.publisher,
    setName: product.setName,
    setCode: product.setCode,
    setStatus: product.setStatus,
    productType: product.productType,
    referenceCode: product.referenceCode,
    language: product.language,
    description: product.description,
    tags: [...product.tags],
  };
}

export function filterCatalogProducts(
  products: readonly CatalogFilterProduct[],
  filters: CatalogFilters
): CatalogFilterProduct[] {
  const query = normalize(filters.query);
  const game = normalize(filters.game);

  return products.filter((product) => {
    if (query && !catalogSearchText(product).includes(query)) return false;
    if (game !== ALL_CATALOG_FILTERS && normalize(product.game) !== game) return false;
    if (filters.status !== ALL_CATALOG_FILTERS && product.setStatus !== filters.status) {
      return false;
    }
    return true;
  });
}

export function catalogGames(products: readonly CatalogFilterProduct[]): string[] {
  return [...new Set(products.map((product) => product.game))].sort((left, right) =>
    left.localeCompare(right)
  );
}

export function catalogStatuses(products: readonly CatalogFilterProduct[]): SetStatus[] {
  const statuses = new Set(products.map((product) => product.setStatus));
  return STATUS_ORDER.filter((status) => statuses.has(status));
}

export function hasCatalogFilters(filters: CatalogFilters): boolean {
  return (
    normalize(filters.query) !== "" ||
    filters.game !== ALL_CATALOG_FILTERS ||
    filters.status !== ALL_CATALOG_FILTERS
  );
}

export function parseCatalogStatusFilter(value: string): CatalogStatusFilter {
  return value === ALL_CATALOG_FILTERS || STATUS_ORDER.includes(value as SetStatus)
    ? (value as CatalogStatusFilter)
    : ALL_CATALOG_FILTERS;
}

export function formatCatalogStatus(status: SetStatus): string {
  return status
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function catalogSearchText(product: CatalogFilterProduct): string {
  return normalize(
    [
      product.name,
      product.game,
      product.publisher,
      product.setName,
      product.setCode,
      product.productType,
      product.referenceCode,
      product.language,
      product.description,
      ...product.tags,
    ].join(" ")
  );
}

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase("en");
}
