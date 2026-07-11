import { describe, expect, it } from "vitest";

import {
  ALL_CATALOG_FILTERS,
  catalogGames,
  catalogStatuses,
  EMPTY_CATALOG_FILTERS,
  filterCatalogProducts,
} from "@/app/(shop)/catalog/catalog-filters";
import { marketplaceProducts } from "@/app/_data/marketplace-fixtures";

describe("catalog filters", () => {
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
});
