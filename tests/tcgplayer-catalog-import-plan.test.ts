import { describe, expect, it } from "vitest";

import type { TcgplayerCatalogSuggestion } from "@/lib/tcgplayer-catalog";
import { buildTcgplayerCatalogImportPlan } from "@/lib/tcgplayer-catalog-import-plan";

const suggestion: TcgplayerCatalogSuggestion = {
  provider: "tcgplayer-storefront",
  productId: 242811,
  sourceUrl: "https://www.tcgplayer.com/product/242811",
  fetchedAt: "2026-07-21T00:00:00.000Z",
  product: {
    name: "Example Booster Box",
    cleanName: "Example Booster Box",
    description: "<p>Thirty-six booster packs.</p>",
    imageUrl: "https://product-images.tcgplayer.com/242811.jpg",
    productType: "Booster Box",
    language: "English",
    upc: null,
    packsPerBox: 36,
    cardsPerPack: 10,
    weightGrams: 720,
  },
  category: {
    id: 3,
    name: "Pokémon",
    publisher: "The Pokémon Company",
  },
  set: {
    id: 42,
    name: "Example Set",
    code: "EX",
    releaseDate: "2026-08-01",
  },
  prices: [],
  skus: [
    {
      skuId: 9001,
      productConditionId: 100,
      conditionId: 1,
      languageId: 1,
      printingId: 1,
      variantId: 1,
      condition: "Near Mint",
      language: "English",
      printing: "Normal",
      barcode: "0123456789012",
      packsPerBox: null,
      cardsPerPack: null,
      weightGrams: null,
      marketPrice: 120,
      lowPrice: 110,
      midPrice: 125,
      highPrice: 140,
      directLowPrice: null,
    },
    {
      skuId: 9002,
      productConditionId: 101,
      conditionId: 1,
      languageId: 2,
      printingId: 2,
      variantId: 2,
      condition: "Near Mint",
      language: "Japanese",
      printing: "First Edition",
      barcode: null,
      packsPerBox: 30,
      cardsPerPack: 5,
      weightGrams: 650,
      marketPrice: 100,
      lowPrice: 90,
      midPrice: 105,
      highPrice: 120,
      directLowPrice: 88,
    },
  ],
  warnings: [],
};

describe("automatic TCGplayer catalog import planning", () => {
  it("reuses matching hierarchy records and builds every returned SKU", () => {
    const plan = buildTcgplayerCatalogImportPlan(
      suggestion,
      [{ id: "category-1", name: "Pokemon", slug: "pokemon" }],
      [
        {
          id: "set-1",
          categoryId: "category-1",
          name: "Example Set",
          code: "EX",
        },
      ],
      [{ code: "booster_box", name: "Booster box" }],
    );

    expect(plan.category.id).toBe("category-1");
    expect(plan.set.id).toBe("set-1");
    expect(plan.productType.code).toBe("booster_box");
    expect(plan.product).toMatchObject({
      name: "Example Booster Box",
      description: "Thirty-six booster packs.",
      language: "EN",
    });
    expect(plan.skus).toHaveLength(2);
    expect(plan.skus[0]).toMatchObject({
      sku: "TCG-242811-9001",
      barcode: "0123456789012",
      packsPerBox: 36,
      cardsPerPack: 10,
      weightGrams: 720,
    });
    expect(plan.skus[1]).toMatchObject({
      sku: "TCG-242811-9002",
      packsPerBox: 30,
      cardsPerPack: 5,
      weightGrams: 650,
    });
  });

  it("creates safe hierarchy fallbacks when provider labels are missing", () => {
    const plan = buildTcgplayerCatalogImportPlan(
      {
        ...suggestion,
        productId: 999,
        product: {
          ...suggestion.product,
          name: "",
          cleanName: null,
          productType: null,
          language: null,
        },
        category: { id: null, name: null, publisher: null },
        set: { id: null, name: null, code: null, releaseDate: "not-a-date" },
        skus: [],
      },
      [],
      [],
      [],
    );

    expect(plan.product.name).toBe("TCGplayer product 999");
    expect(plan.product.language).toBe("EN");
    expect(plan.category).toMatchObject({ id: null, name: "TCGplayer" });
    expect(plan.set).toMatchObject({
      id: null,
      name: "TCGplayer product 999",
      releaseDate: null,
    });
    expect(plan.productType).toMatchObject({
      code: null,
      name: "Sealed product",
    });
    expect(plan.warnings.length).toBeGreaterThanOrEqual(3);
  });
});
