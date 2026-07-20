import { access, readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("separated product-to-listing workflow", () => {
  it("removes the overlapping operations workspace", async () => {
    await expect(
      access(new URL("../app/(shop)/control/operations/page.tsx", import.meta.url))
    ).rejects.toThrow();

    const shell = await readFile(
      new URL("../app/(shop)/control/_components/control-shell.tsx", import.meta.url),
      "utf8"
    );
    expect(shell).not.toContain("/control/operations");
    expect(shell).toContain('label: "Catalog"');
    expect(shell).toContain('label: "Pricing"');
    expect(shell).toContain('label: "Storefront"');
  });

  it("keeps Catalog limited to identity and physical SKU attributes", async () => {
    const [catalogAction, skuForm, intake, editor] = await Promise.all([
      readFile(new URL("../app/actions/catalog.ts", import.meta.url), "utf8"),
      readFile(new URL("../lib/admin-catalog-forms.ts", import.meta.url), "utf8"),
      readFile(
        new URL("../app/(shop)/control/_components/product-intake-form.tsx", import.meta.url),
        "utf8"
      ),
      readFile(
        new URL("../app/(shop)/control/_components/catalog-product-editor.tsx", import.meta.url),
        "utf8"
      ),
    ]);
    expect(catalogAction).toContain('rpc("admin_upsert_catalog_sku"');
    expect(catalogAction).not.toContain("p_price_cents");
    expect(catalogAction).not.toContain("p_published");
    expect(skuForm).not.toContain("priceCents");
    expect(skuForm).not.toContain("msrpCents");
    expect(intake).not.toContain('name="published"');
    expect(editor).not.toContain('name="published"');
    expect(editor).not.toContain('name="priceCents"');
  });

  it("guides staff through pricing, supply, availability, review, and publication", async () => {
    const [workflow, pricing, supply, listing, listingDetail, listingAction] = await Promise.all([
      readFile(
        new URL("../app/(shop)/control/_components/product-listing-workflow.tsx", import.meta.url),
        "utf8"
      ),
      readFile(
        new URL("../app/(shop)/control/pricing/skus/[skuId]/page.tsx", import.meta.url),
        "utf8"
      ),
      readFile(
        new URL("../app/(shop)/control/supply/inventory/[skuId]/page.tsx", import.meta.url),
        "utf8"
      ),
      readFile(
        new URL("../app/(shop)/control/_components/listing-item-form.tsx", import.meta.url),
        "utf8"
      ),
      readFile(
        new URL("../app/(shop)/control/storefront/listings/[productId]/page.tsx", import.meta.url),
        "utf8"
      ),
      readFile(new URL("../app/actions/admin.ts", import.meta.url), "utf8"),
    ]);
    for (const step of [
      "Product",
      "Physical SKU",
      "Pricing",
      "Supply",
      "Availability & listing",
      "Readiness review",
      "Publish",
    ]) {
      expect(workflow).toContain(step);
    }
    expect(pricing).toContain("setSkuPrice");
    expect(supply).toContain("updateInventory");
    expect(listing).toContain('name="availabilityMode"');
    expect(listing).toContain('name="orderOpenAt"');
    expect(listing).toContain('name="releaseDate"');
    expect(listing).toContain("approved separately below");
    expect(listingDetail).toContain("Approve and publish");
    expect(listingAction).toContain('rpc("admin_upsert_storefront_listing"');
    expect(listingAction).toContain('rpc("admin_set_listing_publication"');
  });
});
