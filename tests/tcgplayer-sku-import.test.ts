import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

import { normalizeTcgplayerCatalog } from "@/lib/tcgplayer-catalog";
import { buildTcgplayerSkuImportDrafts } from "@/lib/tcgplayer-sku-import";

describe("TCGplayer SKU import", () => {
  it("fills every supported local SKU field and leaves unavailable values blank", () => {
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
      skus: {
        skus: [
          {
            skuId: 987,
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
            skuId: 988,
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
    expect(suggestion.skus[0]).toMatchObject({
      barcode: "998877665544",
      packsPerBox: null,
      cardsPerPack: null,
      weightGrams: null,
    });

    expect(buildTcgplayerSkuImportDrafts(suggestion)).toEqual([
      expect.objectContaining({
        sourceSkuId: 987,
        sourceProductConditionId: 12,
        sourceConditionId: 1,
        sourceLanguageId: 1,
        sourceVariantId: 11,
        sku: "TCG-242811-987",
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
        sourceSkuId: 988,
        sku: "TCG-242811-988",
        barcode: null,
        packsPerBox: 36,
        cardsPerPack: 10,
        weightGrams: 720,
      }),
    ]);
  });

  it("uses the product UPC only when exactly one SKU was returned", () => {
    const suggestion = normalizeTcgplayerCatalog({
      productId: 77,
      details: {
        productName: "Single SKU product",
        categoryName: "Magic: The Gathering",
        groupName: "Example Set",
        productTypeName: "Sealed Products",
        upc: "111122223333",
      },
      skus: {
        skus: [{ skuId: 88, condition: "Unopened", language: "English" }],
      },
    });

    expect(buildTcgplayerSkuImportDrafts(suggestion)[0]?.barcode).toBe(
      "111122223333",
    );
  });

  it("creates the product and SKU records through one permissioned database transaction", async () => {
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
          "../supabase/migrations/20260721190000_import_tcgplayer_skus.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    ]);

    expect(component).toContain('name="tcgplayerSkus"');
    expect(component).toContain("ImportedSkuFields");
    expect(helpers).toContain("buildTcgplayerSkuImportDrafts");
    expect(action).toContain("requireControlPermission(");
    expect(action).toContain('"catalog.manage"');
    expect(action).toContain('"admin_create_tcgplayer_catalog_product"');
    expect(migration).toContain(
      "from public.admin_create_catalog_product_hierarchy(",
    );
    expect(migration).toContain("TCGPLAYER_SKU_IMPORT");
    expect(migration).toContain("jsonb_array_length(v_skus) > 50");
    expect(migration).not.toContain("admin_set_sku_price");
  });
});
