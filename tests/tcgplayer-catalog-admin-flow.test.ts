import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("TCGplayer catalog admin flow", () => {
  it("keeps third-party requests behind the authenticated server API", async () => {
    const [route, component, page, client] = await Promise.all([
      readFile(
        new URL("../app/api/control/tcgplayer-catalog/route.ts", import.meta.url),
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

    expect(route).toContain('requireApiPermission(request, "catalog.manage")');
    expect(route).toContain("enforceRateLimit");
    expect(route).toContain('scope: "admin.tcgplayer_catalog_lookup"');
    expect(client).toContain("TCGPLAYER_PRODUCT_DETAILS_API");
    expect(client).toContain(
      '"https://mp-search-api.tcgplayer.com/v2/product"',
    );
    expect(client).toContain("TCGPLAYER_PRODUCT_ENRICHMENT_API");
    expect(client).toContain('"https://mpapi.tcgplayer.com/v2/product"');
    expect(client).toContain("MAX_UPSTREAM_RESPONSE_BYTES");
    expect(client).toContain("UPSTREAM_TIMEOUT_MS");
    expect(component).toContain("api.request<TcgplayerCatalogSuggestion>");
    expect(component).not.toContain("mp-search-api.tcgplayer.com");
    expect(component).not.toContain("mpapi.tcgplayer.com");
    expect(page).toContain("TcgplayerCatalogImport");
  });

  it("creates a catalog draft through the permissioned action without crossing approval domains", async () => {
    const component = await readFile(
      new URL(
        "../app/(shop)/control/_components/tcgplayer-catalog-import-complete.tsx",
        import.meta.url,
      ),
      "utf8",
    );

    expect(component).toContain("createCatalogProduct");
    expect(component).toContain("Create catalog draft");
    expect(component).toContain(
      "pricing, inventory, listing approval, and publication remain separate",
    );
    expect(component).not.toContain("admin_upsert_sku_price");
    expect(component).not.toContain("admin_adjust_inventory");
    expect(component).not.toContain("admin_set_listing_publication");
  });
});
