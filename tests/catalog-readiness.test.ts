import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

import { hasSellableCatalogSku } from "@/lib/catalog-readiness";

const migrationPath = new URL(
  "../supabase/migrations/20260718093000_require_sellable_sku_for_storefront.sql",
  import.meta.url
);

describe("catalog SKU readiness", () => {
  it("requires an active SKU with a positive price", () => {
    expect(hasSellableCatalogSku({ product_variants: null })).toBe(false);
    expect(
      hasSellableCatalogSku({
        product_variants: [{ booster_box_skus: [{ active: true, price_cents: 0 }] }],
      })
    ).toBe(false);
    expect(
      hasSellableCatalogSku({
        product_variants: [{ booster_box_skus: [{ active: false, price_cents: 12900 }] }],
      })
    ).toBe(false);
    expect(
      hasSellableCatalogSku({
        product_variants: [{ booster_box_skus: [{ active: true, price_cents: 12900 }] }],
      })
    ).toBe(true);
  });

  it("enforces storefront and publication readiness in PostgreSQL", async () => {
    const migration = await readFile(migrationPath, "utf8");

    expect(migration).toContain('drop policy "catalog readable" on public.products');
    expect(migration).toContain("sku.active");
    expect(migration).toContain("sku.price_cents > 0");
    expect(migration).toContain("alter column published set default false");
    expect(migration).toContain("product requires an active SKU with a positive price before publication");
    expect(migration).toContain("create trigger unpublish_listing_without_sellable_sku");
  });

  it("shows the readiness reminder throughout the control workspace", async () => {
    const [layout, alert] = await Promise.all([
      readFile(new URL("../app/(shop)/control/layout.tsx", import.meta.url), "utf8"),
      readFile(
        new URL(
          "../app/(shop)/control/_components/catalog-readiness-alert.tsx",
          import.meta.url
        ),
        "utf8"
      ),
    ]);

    expect(layout).toContain("<CatalogReadinessAlert />");
    expect(alert).toContain("Complete SKU setup");
    expect(alert).toContain("active SKU with a positive selling price");
  });
});
