import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("product publication flow", () => {
  it("keeps publication in Storefront after Catalog, Pricing, and Supply readiness", async () => {
    const [intake, catalogAction, listing, listingDetail, listingAction, migration] =
      await Promise.all([
        readFile(
          new URL("../app/(shop)/control/_components/product-intake-form.tsx", import.meta.url),
          "utf8"
        ),
        readFile(new URL("../app/actions/catalog.ts", import.meta.url), "utf8"),
        readFile(
          new URL("../app/(shop)/control/_components/listing-item-form.tsx", import.meta.url),
          "utf8"
        ),
        readFile(
          new URL(
            "../app/(shop)/control/storefront/listings/[productId]/page.tsx",
            import.meta.url
          ),
          "utf8"
        ),
        readFile(new URL("../app/actions/admin.ts", import.meta.url), "utf8"),
        readFile(
          new URL(
            "../supabase/migrations/20260720100000_admin_domain_permissions_and_pricing.sql",
            import.meta.url
          ),
          "utf8"
        ),
      ]);

    expect(intake).not.toContain('name="published"');
    expect(catalogAction).not.toContain("p_published");
    expect(listing).not.toContain('name="published"');
    expect(listing).toContain("approved separately below");
    expect(listing).toContain('name="availabilityMode"');
    expect(listingAction).toContain('rpc("admin_upsert_storefront_listing"');
    expect(listingDetail).toContain('name="published"');
    expect(listingAction).toContain('rpc("admin_set_listing_publication"');
    expect(migration).toContain("alter column published set default false");
    expect(migration).toContain("storefront publication permission required");
    expect(migration).toContain("admin_set_listing_publication");
    expect(migration).toContain("an active physical SKU is required before publishing");
    expect(migration).toContain("a current SKU price is required before publishing");
    expect(migration).toContain("available-now publication requires sellable inventory");
  });
});
