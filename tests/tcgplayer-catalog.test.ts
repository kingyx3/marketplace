import { describe, expect, it, vi } from "vitest";

import {
  TcgplayerCatalogError,
  fetchTcgplayerCatalogSuggestion,
  normalizeTcgplayerCatalog,
  parseTcgplayerProductId,
} from "@/lib/tcgplayer-catalog";

describe("TCGplayer catalog assist", () => {
  it("accepts numeric IDs and tcgplayer.com product URLs only", () => {
    expect(parseTcgplayerProductId("242811")).toBe(242811);
    expect(
      parseTcgplayerProductId("https://www.tcgplayer.com/product/242811/example-product")
    ).toBe(242811);
    expect(
      parseTcgplayerProductId(
        "https://www.tcgplayer.com/product/692969/magic-the-hobbit-the-hobbit-scene-box-treasures-of-smaug?Language=English"
      )
    ).toBe(692969);
    expect(() => parseTcgplayerProductId("https://example.com/product/242811")).toThrow(
      TcgplayerCatalogError
    );
    expect(() => parseTcgplayerProductId("not-a-product")).toThrow(
      "Enter a TCGplayer product URL or numeric product ID."
    );
  });

  it("normalizes product, set, category, variant, and price data while rejecting unsafe URLs", () => {
    const suggestion = normalizeTcgplayerCatalog({
      productId: 242811,
      fetchedAt: "2026-07-21T00:00:00.000Z",
      details: {
        data: {
          productName: "Pokémon Booster Box",
          cleanName: "Pokémon Booster Box",
          description: "A sealed booster box.",
          categoryId: 3,
          categoryName: "Pokémon",
          groupId: 1234,
          groupName: "Example Set",
          groupAbbreviation: "EXS",
          productTypeName: "Booster Box",
          languageName: "English",
          manufacturerName: "The Pokémon Company",
          upc: "123456789012",
          releaseDate: "2026-08-15T00:00:00Z",
          url: "javascript:alert(1)",
          imageUrl: "javascript:alert(1)",
        },
      },
      prices: {
        pricePoints: [
          {
            conditionName: "Near Mint",
            printingName: "Normal",
            marketPrice: 129.99,
            lowPrice: 119.5,
          },
        ],
      },
      variants: {
        variants: [
          {
            providerVariantId: 987,
            productConditionId: 12,
            conditionName: "Near Mint",
            languageName: "English",
            printingName: "Normal",
            marketPrice: 129.99,
          },
        ],
      },
    });

    expect(suggestion).toMatchObject({
      productId: 242811,
      sourceUrl: "https://www.tcgplayer.com/product/242811",
      product: {
        name: "Pokémon Booster Box",
        cleanName: "Pokémon Booster Box",
        imageUrl: null,
        productType: "Booster Box",
        language: "English",
        upc: "123456789012",
      },
      category: {
        id: 3,
        name: "Pokémon",
        publisher: "The Pokémon Company",
      },
      set: {
        id: 1234,
        name: "Example Set",
        code: "EXS",
        releaseDate: "2026-08-15",
      },
    });
    expect(suggestion.prices[0]).toMatchObject({ marketPrice: 129.99, lowPrice: 119.5 });
    expect(suggestion.variants[0]).toMatchObject({
      providerVariantId: 987,
      condition: "Near Mint",
      language: "English",
    });
  });

  it("loads current storefront product details and embedded variants for newer product IDs", async () => {
    const fetchImplementation = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "https://mp-search-api.tcgplayer.com/v2/product/692969/details") {
        return new Response(
          JSON.stringify({
            productId: 692969,
            productName: "The Hobbit Scene Box - Treasures of Smaug",
            productLineId: 1,
            productLineName: "Magic: The Gathering",
            setId: 9911,
            setName: "The Hobbit",
            setCode: "HOB",
            productTypeName: "Sealed Products",
            marketPrice: 64.99,
            lowestPrice: 59.5,
            customAttributes: {
              description: "A sealed scene box.",
              releaseDate: "2026-08-14T00:00:00Z",
            },
            skus: [
              {
                skuId: 880011,
                condition: "Unopened",
                printing: "Normal",
                language: "English",
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
      return new Response("upstream error", { status: 503 });
    });

    const suggestion = await fetchTcgplayerCatalogSuggestion(
      "https://www.tcgplayer.com/product/692969/magic-the-hobbit-the-hobbit-scene-box-treasures-of-smaug?Language=English",
      {
        fetchImplementation,
        now: () => new Date("2026-07-21T00:00:00.000Z"),
      }
    );

    expect(fetchImplementation).toHaveBeenCalledWith(
      "https://mp-search-api.tcgplayer.com/v2/product/692969/details",
      expect.objectContaining({ method: "GET", cache: "no-store" })
    );
    expect(suggestion).toMatchObject({
      productId: 692969,
      product: {
        name: "The Hobbit Scene Box - Treasures of Smaug",
        description: "A sealed scene box.",
        productType: "Sealed Products",
        language: "English",
      },
      category: {
        id: 1,
        name: "Magic: The Gathering",
      },
      set: {
        id: 9911,
        name: "The Hobbit",
        code: "HOB",
        releaseDate: "2026-08-14",
      },
    });
    expect(suggestion.prices[0]).toMatchObject({ marketPrice: 64.99, lowPrice: 59.5 });
    expect(suggestion.variants[0]).toMatchObject({
      providerVariantId: 880011,
      condition: "Unopened",
      printing: "Normal",
      language: "English",
    });
    expect(suggestion.warnings).toEqual([]);
  });

  it("treats price and variant lookups as optional enrichment", async () => {
    const fetchImplementation = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/details")) {
        return new Response(
          JSON.stringify({
            productName: "Example Booster Box",
            categoryName: "Pokémon",
            groupName: "Example Set",
            productTypeName: "Booster Box",
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
      return new Response("upstream error", { status: 503 });
    });

    const suggestion = await fetchTcgplayerCatalogSuggestion("242811", {
      fetchImplementation,
      now: () => new Date("2026-07-21T00:00:00.000Z"),
    });

    expect(fetchImplementation).toHaveBeenCalledWith(
      "https://mp-search-api.tcgplayer.com/v2/product/242811/details",
      expect.objectContaining({ method: "GET", cache: "no-store" })
    );
    expect(suggestion.warnings).toEqual(
      expect.arrayContaining([
        "Live price points were unavailable; review pricing manually.",
        "TCGplayer sellable variants were unavailable; review the product references manually.",
      ])
    );
    expect(suggestion.prices).toEqual([]);
    expect(suggestion.variants).toEqual([]);
  });
});
