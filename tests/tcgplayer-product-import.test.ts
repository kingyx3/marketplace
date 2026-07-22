import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

import { normalizeTcgplayerCatalog } from "@/lib/tcgplayer-catalog";
import { buildTcgplayerProductImportDrafts } from "@/lib/tcgplayer-product-import";

describe("TCGplayer product import", () => {
  it("creates one complete local product draft per provider variant", () => {
    const suggestion = normalizeTcgplayerCatalog({
      productId: 242811,
      details: {
        productName: "Example Booster Box",
        categoryName: "Pokémon",
        groupName: "Example Set",
        productTypeName: "Booster Box",
        upc: "123456789012",
        customAttributes: {
          packsPerBox: 36,
          cardsPerPack: 10,
          weightGrams: 720,
        },
      },
      prices: {
        pricePoints: [
          {
            productConditionId: 12,
            conditionId: 1,
            languageId: 1,
            variantId: 11,
            conditionName: "Unopened",
            languageName: "English",
            printingName: "Normal",
            marketPrice: 129.99,
            lowPrice: 119.5,
            midPrice: 124.5,
            highPrice: 140,
            directLowPrice: 121,
          },
        ],
      },
      variants: {
        variants: [
          {
            providerVariantId: 987,
            productConditionId: 12,
            conditionId: 1,
            languageId: 1,
            variantId: 11,
            conditionName: "Unopened",
            languageName: "English",
            printingName: "Normal",
            barcode: "998877665544",
          },
          {
            providerVariantId: 988,
            conditionName: "Unopened",
            languageName: "Japanese",
            printingName: "Normal",
          },
        ],
      },
    });

    expect(suggestion.product).toMatchObject({
      packsPerBox: 36,
      cardsPerPack: 10,
      weightGrams: 720,
    });
    expect(suggestion.variants[0]).toMatchObject({
      barcode: "998877665544",
      packsPerBox: null,
      cardsPerPack: null,
      weightGrams: null,
    });

    expect(buildTcgplayerProductImportDrafts(suggestion)).toEqual([
      expect.objectContaining({
        sourceVariantId: 987,
        sourceProductConditionId: 12,
        sourceConditionId: 1,
        sourceLanguageId: 1,
        sourceProviderVariantId: 11,
        referenceCode: "TCG-242811-987",
        name: "Example Booster Box — English · Unopened · Normal",
        barcode: "998877665544",
        packsPerBox: 36,
        cardsPerPack: 10,
        weightGrams: 720,
        condition: "Unopened",
        language: "English",
        printing: "Normal",
        marketPriceUsd: 129.99,
        lowPriceUsd: 119.5,
        midPriceUsd: 124.5,
        highPriceUsd: 140,
        directLowPriceUsd: 121,
      }),
      expect.objectContaining({
        sourceVariantId: 988,
        referenceCode: "TCG-242811-988",
        barcode: null,
        packsPerBox: 36,
        cardsPerPack: 10,
        weightGrams: 720,
      }),
    ]);
  });

  it("uses the product UPC only when exactly one variant was returned", () => {
    const suggestion = normalizeTcgplayerCatalog({
      productId: 77,
      details: {
        productName: "Single variant product",
        categoryName: "Magic: The Gathering",
        groupName: "Example Set",
        productTypeName: "Sealed Products",
        upc: "111122223333",
      },
      variants: {
        variants: [{ providerVariantId: 88, condition: "Unopened", language: "English" }],
      },
    });

    expect(buildTcgplayerProductImportDrafts(suggestion)[0]?.barcode).toBe(
      "111122223333",
    );
  });

  it("creates products and a review receipt through one permissioned transaction", async () => {
    const [component, helpers, action, migration] = await Promise.all([
      readFile(
        new URL(
          "../app/(shop)/control/_components/tcgplayer-catalog-import-complete.tsx",
          import.meta.url,
        ),
        "utf8",
      ),
      readFile(
        new URL(
          "../app/(shop)/control/_components/tcgplayer-catalog-import-helpers.ts",
          import.meta.url,
        ),
        "utf8",
      ),
      readFile(
        new URL("../app/actions/tcgplayer-catalog.ts", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL(
          "../supabase/migrations/20260722090000_product_only_tcgplayer_import.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    ]);

    expect(component).toContain('name="tcgplayerProducts"');
    expect(component).toContain("ImportedProductFields");
    expect(helpers).toContain("buildTcgplayerProductImportDrafts");
    expect(action).toContain("requireControlPermission(");
    expect(action).toContain('"catalog.manage"');
    expect(action).toContain('"admin_import_tcgplayer_products"');
    expect(migration).toContain(
      "from public.admin_create_catalog_product_hierarchy(",
    );
    expect(migration).toContain("TCGPLAYER_PRODUCT_IMPORT");
    expect(migration).toContain("jsonb_array_length(p_products) not between 1 and 50");
    expect(migration).toContain("catalog_import_products");
    expect(migration).not.toContain("admin_set_sku_price");
  });
});
