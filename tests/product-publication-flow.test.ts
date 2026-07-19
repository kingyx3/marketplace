import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("product publication flow", () => {
  it("manages publication with product creation and editing", async () => {
    const [intake, editor, action, publicationMigration, readinessMigration] = await Promise.all([
      readFile(
        new URL("../app/(shop)/control/_components/product-intake-form.tsx", import.meta.url),
        "utf8"
      ),
      readFile(
        new URL("../app/(shop)/control/_components/catalog-product-editor.tsx", import.meta.url),
        "utf8"
      ),
      readFile(new URL("../app/actions/catalog.ts", import.meta.url), "utf8"),
      readFile(
        new URL(
          "../supabase/migrations/20260719150000_product_publication_in_product_flow.sql",
          import.meta.url
        ),
        "utf8"
      ),
      readFile(
        new URL(
          "../supabase/migrations/20260718093000_require_sellable_sku_for_storefront.sql",
          import.meta.url
        ),
        "utf8"
      ),
    ]);

    expect(intake).toContain('name="published" type="hidden" value="false"');
    expect(intake).toContain('defaultChecked name="published" type="checkbox" value="true"');
    expect(intake).toContain("Published is selected by default");
    expect(editor).toContain('checked={product.published} label="Published" name="published"');
    expect(editor).toContain("active SKU with a positive price");

    expect(action).toContain('rpc("admin_create_catalog_product_with_publication"');
    expect(action).toContain('rpc("admin_upsert_catalog_product_with_publication"');
    expect(action).toContain("p_published: published");
    expect(action).toContain('booleanFormValue(formData, "published", true)');

    expect(publicationMigration).toContain("alter column published set default true");
    expect(publicationMigration).toContain("drop trigger if exists enforce_listing_sellable_sku");
    expect(publicationMigration).toContain("drop trigger if exists unpublish_listing_without_sellable_sku");
    expect(publicationMigration).toContain("admin_create_catalog_product_with_publication");
    expect(publicationMigration).toContain("admin_upsert_catalog_product_with_publication");

    expect(readinessMigration).toContain("and sku.active");
    expect(readinessMigration).toContain("and sku.price_cents > 0");
  });
});
