import { describe, expect, it } from "vitest";

import {
  ALL_CATALOG_FILTERS,
  catalogGames,
  catalogStatuses,
  createCatalogFilterProduct,
  EMPTY_CATALOG_FILTERS,
  filterCatalogProducts,
  formatCatalogStatus,
  hasCatalogFilters,
  parseCatalogStatusFilter,
} from "@/app/(shop)/catalog/catalog-filters";
import { marketplaceProducts } from "@/app/_data/marketplace-fixtures";

describe("catalog filters", () => {
  it("projects only the metadata required by the client filter boundary", () => {
    const product = createCatalogFilterProduct(marketplaceProducts[0]);

    expect(Object.keys(product).sort()).toEqual(
      [
        "description",
        "game",
        "language",
        "name",
        "productType",
        "publisher",
        "setCode",
        "setName",
        "setStatus",
        "sku",
        "slug",
        "tags",
      ].sort()
    );
    expect(product).not.toHaveProperty("priceCents");
    expect(product).not.toHaveProperty("onHand");
    expect(product).not.toHaveProperty("channels");
  });

  it("searches across customer-facing product fields case-insensitively", () => {
    expect(
      filterCatalogProducts(marketplaceProducts, {
        ...EMPTY_CATALOG_FILTERS,
        query: "  pokemon  ",
      }).map((product) => product.slug)
    ).toEqual(["prism-collector-booster-box"]);

    expect(
      filterCatalogProducts(marketplaceProducts, {
        ...EMPTY_CATALOG_FILTERS,
        query: "mtg-smp-pbb-en",
      }).map((product) => product.slug)
    ).toEqual(["smp-play-booster-box"]);
  });

  it("combines game and status filters", () => {
    expect(
      filterCatalogProducts(marketplaceProducts, {
        query: "",
        game: "Magic: The Gathering",
        status: "preorder_open",
      }).map((product) => product.slug)
    ).toEqual(["smp-play-booster-box"]);
  });

  it("returns no products when filters do not intersect", () => {
    expect(
      filterCatalogProducts(marketplaceProducts, {
        query: "collector",
        game: "Lorcana",
        status: ALL_CATALOG_FILTERS,
      })
    ).toEqual([]);
  });

  it("preserves source ordering when no filters are active", () => {
    expect(filterCatalogProducts(marketplaceProducts, EMPTY_CATALOG_FILTERS)).toEqual(
      marketplaceProducts
    );
  });

  it("derives stable game and status options from available products", () => {
    expect(catalogGames(marketplaceProducts)).toEqual([
      "Lorcana",
      "Magic: The Gathering",
      "One Piece Card Game",
      "Pokemon TCG",
    ]);
    expect(catalogStatuses(marketplaceProducts)).toEqual([
      "preorder_open",
      "released",
      "announced",
    ]);
  });

  it("normalizes filter state and rejects unknown status values", () => {
    expect(hasCatalogFilters(EMPTY_CATALOG_FILTERS)).toBe(false);
    expect(hasCatalogFilters({ ...EMPTY_CATALOG_FILTERS, query: "   " })).toBe(false);
    expect(hasCatalogFilters({ ...EMPTY_CATALOG_FILTERS, game: "Lorcana" })).toBe(true);
    expect(parseCatalogStatusFilter("released")).toBe("released");
    expect(parseCatalogStatusFilter("invalid-status")).toBe(ALL_CATALOG_FILTERS);
    expect(formatCatalogStatus("preorder_open")).toBe("Preorder Open");
  });
});
