import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("TCGplayer catalog admin flow", () => {
  it("keeps third-party requests in the permissioned and rate-limited server action", async () => {
    const [action, component, page, client] = await Promise.all([
      readFile(
        new URL("../app/actions/tcgplayer-catalog.ts", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL(
          "../app/(shop)/control/_components/tcgplayer-catalog-import-complete.tsx",
          import.meta.url,
        ),
        "utf8",
      ),
      readFile(
        new URL(
          "../app/(shop)/control/catalog/products/new/page.tsx",
          import.meta.url,
        ),
        "utf8",
      ),
      readFile(new URL("../lib/tcgplayer-catalog.ts", import.meta.url), "utf8"),
    ]);

    expect(action).toContain('requireControlPermission(\n    "catalog.manage"');
    expect(action).toContain("enforceRateLimit");
    expect(action).toContain('scope: "admin.tcgplayer_catalog_import"');
    expect(action).toContain("fetchTcgplayerCatalogSuggestion(reference)");
    expect(client).toContain("TCGPLAYER_PRODUCT_DETAILS_API");
    expect(client).toContain(
      '"https://mp-search-api.tcgplayer.com/v2/product"',
    );
    expect(client).toContain("TCGPLAYER_PRODUCT_ENRICHMENT_API");
    expect(client).toContain('"https://mpapi.tcgplayer.com/v2/product"');
    expect(client).toContain("MAX_UPSTREAM_RESPONSE_BYTES");
    expect(client).toContain("UPSTREAM_TIMEOUT_MS");
    expect(component).not.toContain("mp-search-api.tcgplayer.com");
    expect(component).not.toContain("mpapi.tcgplayer.com");
    expect(component).not.toContain("createApiClient");
    expect(page).toContain("TcgplayerCatalogImport");
  });

  it("creates the complete catalog record before sending the admin to confirmation", async () => {
    const [action, component, submitButton, confirmation, confirmationPage] =
      await Promise.all([
        readFile(
          new URL("../app/actions/tcgplayer-catalog.ts", import.meta.url),
          "utf8",
        ),
        readFile(
          new URL(
            "../app/(shop)/control/_components/tcgplayer-catalog-import-complete.tsx",
            import.meta.url,
          ),
          "utf8",
        ),
        readFile(
          new URL(
            "../app/(shop)/control/_components/tcgplayer-import-submit-button.tsx",
            import.meta.url,
          ),
          "utf8",
        ),
        readFile(
          new URL(
            "../app/(shop)/control/_components/tcgplayer-import-confirmation.tsx",
            import.meta.url,
          ),
          "utf8",
        ),
        readFile(
          new URL(
            "../app/(shop)/control/catalog/products/[productId]/import-complete/page.tsx",
            import.meta.url,
          ),
          "utf8",
        ),
      ]);

    expect(component).toContain("createTcgplayerCatalogProduct");
    expect(component).toContain('name="tcgplayerReference"');
    expect(component).not.toContain("ImportedSkuFields");
    expect(submitButton).toContain("Import product and SKUs");
    expect(action).toContain("buildTcgplayerCatalogImportPlan");
    expect(action).toContain('"admin_create_tcgplayer_catalog_product"');
    expect(action).toContain("p_skus: importedSkus");
    expect(action).toContain("/import-complete");
    expect(confirmationPage).toContain("TcgplayerImportConfirmation");
    expect(confirmation).toContain("CatalogProductDetailsEditor");
    expect(confirmation).toContain("product.skus.map");
    expect(confirmation).toContain("ImportedSkuSection");
    expect(confirmation).toContain("upsertCatalogSku");
    expect(confirmation).toContain("Save this SKU");
    expect(confirmation).not.toContain("admin_upsert_sku_price");
    expect(confirmation).not.toContain("admin_adjust_inventory");
    expect(confirmation).not.toContain("admin_set_listing_publication");
  });
});
