import type {
  MarketplaceProduct,
  SetStatus,
} from "@/app/_data/marketplace-fixtures";

export const ALL_CATALOG_FILTERS = "all" as const;

export type CatalogStatusFilter = typeof ALL_CATALOG_FILTERS | SetStatus;

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

export function filterCatalogProducts(
  products: MarketplaceProduct[],
  filters: CatalogFilters
): MarketplaceProduct[] {
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

export function catalogGames(products: MarketplaceProduct[]): string[] {
  return [...new Set(products.map((product) => product.game))].sort((left, right) =>
    left.localeCompare(right)
  );
}

export function catalogStatuses(products: MarketplaceProduct[]): SetStatus[] {
  const statuses = new Set(products.map((product) => product.setStatus));
  return STATUS_ORDER.filter((status) => statuses.has(status));
}

function catalogSearchText(product: MarketplaceProduct): string {
  return normalize(
    [
      product.name,
      product.game,
      product.publisher,
      product.setName,
      product.setCode,
      product.productType,
      product.sku,
      product.language,
      product.description,
      ...product.tags,
    ].join(" ")
  );
}

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase("en");
}
