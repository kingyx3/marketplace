import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

import { isSellableCatalogProduct } from "@/lib/catalog-readiness";

describe("catalog product readiness", () => {
  it("preserves the legacy checkout-cache readiness helper", () => {
    expect(isSellableCatalogProduct({ active: false, price_cents: 12900 })).toBe(false);
    expect(isSellableCatalogProduct({ active: true, price_cents: 0 })).toBe(false);
    expect(isSellableCatalogProduct({ active: true, price_cents: 12900 })).toBe(true);
  });

  it("shows per-product readiness in the guided workflow", async () => {
    const [detail, workflow] = await Promise.all([
      readFile(
        new URL("../app/(shop)/control/catalog/products/[productId]/page.tsx", import.meta.url),
        "utf8"
      ),
      readFile(
        new URL("../app/(shop)/control/_components/product-listing-workflow.tsx", import.meta.url),
        "utf8"
      ),
    ]);
    expect(detail).toContain("ProductListingWorkflow");
    expect(workflow).toContain("Product-to-storefront readiness");
    expect(workflow).toContain("Readiness review");
  });

  it("enforces final readiness in the Storefront database function", async () => {
    const migration = await readFile(
      new URL(
        "../supabase/migrations/20260720100000_admin_domain_permissions_and_pricing.sql",
        import.meta.url
      ),
      "utf8"
    );
    expect(migration).toContain("admin_upsert_storefront_listing");
    expect(migration).toContain("price.active");
    expect(migration).toContain("inventory.available > inventory.safety_stock");
  });
});
