import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  adminCatalogProductCreateFromForm,
  adminCatalogProductFromForm,
  adminInventoryAdjustmentFromForm,
} from "@/lib/admin-catalog-forms";

describe("admin catalog management", () => {
  it("parses product display names, relational identity fields, and normalized language", () => {
    const form = new FormData();
    form.set("name", "Pokémon Destined Rivals Booster Box");
    form.set("categoryId", "22222222-2222-4222-8222-222222222222");
    form.set("setId", "33333333-3333-4333-8333-333333333333");
    form.set("productType", "booster_box");
    form.set("description", "A sealed display box");
    form.set("language", "en");
    form.set("imageUrl", "https://example.test/image.png");
    form.set("active", "true");

    expect(adminCatalogProductFromForm(form)).toMatchObject({
      name: "Pokémon Destined Rivals Booster Box",
      categoryId: "22222222-2222-4222-8222-222222222222",
      setId: "33333333-3333-4333-8333-333333333333",
      productType: "booster_box",
      language: "EN",
      active: true,
    });
  });

  it("generates hierarchy identifiers while preserving the explicit product display name", () => {
    const form = new FormData();
    form.set("name", "Example Game First Release Premium Collection Box");
    form.set("categoryMode", "new");
    form.set("newCategoryName", "Example Game");
    form.set("newCategoryPublisher", "Example Publisher");
    form.set("setMode", "new");
    form.set("newSetName", "First Release");
    form.set("newSetReleaseDate", "2026-08-01");
    form.set("newSetStatus", "preorder_open");
    form.set("productTypeMode", "new");
    form.set("newProductTypeName", "Premium Collection Box");
    form.set("language", "en");
    form.set("active", "true");

    expect(adminCatalogProductCreateFromForm(form)).toMatchObject({
      name: "Example Game First Release Premium Collection Box",
      categoryId: null,
      newCategoryName: "Example Game",
      newCategorySlug: "example-game",
      newCategoryPublisher: "Example Publisher",
      setId: null,
      newSetName: "First Release",
      newSetCode: "FIRST-RELEASE",
      newSetReleaseDate: "2026-08-01",
      newSetStatus: "preorder_open",
      productType: null,
      newProductTypeName: "Premium Collection Box",
      newProductTypeCode: "premium_collection_box",
      language: "EN",
    });
  });

  it("requires a new set when creating a new category", () => {
    const form = new FormData();
    form.set("name", "Example Game Booster Box");
    form.set("categoryMode", "new");
    form.set("newCategoryName", "Example Game");
    form.set("setMode", "existing");
    form.set("setId", "33333333-3333-4333-8333-333333333333");
    form.set("productType", "booster_box");

    expect(() => adminCatalogProductCreateFromForm(form)).toThrow(
      "Add a set for the new category before creating its product"
    );
  });

  it("requires a valid product display name", () => {
    const form = new FormData();
    form.set("name", "---");
    form.set("categoryId", "22222222-2222-4222-8222-222222222222");
    form.set("setId", "33333333-3333-4333-8333-333333333333");
    form.set("productType", "booster_box");

    expect(() => adminCatalogProductFromForm(form)).toThrow(
      "Display name must contain letters or numbers for its generated slug"
    );
  });

  it("rejects invalid product types and negative physical product attributes", () => {
    const product = new FormData();
    product.set("name", "Example Booster Box");
    product.set("categoryId", "22222222-2222-4222-8222-222222222222");
    product.set("setId", "33333333-3333-4333-8333-333333333333");
    product.set("productType", "not valid");

    expect(() => adminCatalogProductFromForm(product)).toThrow("Select a valid product type");

    product.set("productType", "booster_box");
    product.set("packsPerBox", "-1");
    expect(() => adminCatalogProductFromForm(product)).toThrow("packsPerBox must be at least 1");
  });

  it("requires reason-coded non-negative inventory adjustments", () => {
    const form = new FormData();
    form.set("productId", "11111111-1111-4111-8111-111111111111");
    form.set("onHand", "2");
    form.set("incoming", "10");
    form.set("safetyStock", "1");
    form.set("reasonCode", "stock_count");
    form.set("reasonNote", "Cycle count");

    expect(adminInventoryAdjustmentFromForm(form)).toEqual({
      productId: "11111111-1111-4111-8111-111111111111",
      onHand: 2,
      incoming: 10,
      safetyStock: 1,
      reasonCode: "stock_count",
      reasonNote: "Cycle count",
    });

    form.set("reasonCode", "surprise");
    expect(() => adminInventoryAdjustmentFromForm(form)).toThrow("invalid inventory reason code");
  });

  it("keeps catalog admin mutations service-role-only and audited", async () => {
    const migration = await readFile(
      new URL("../supabase/migrations/20260722090000_product_only_tcgplayer_import.sql", import.meta.url),
      "utf8"
    );
    const displayNameMigration = await readFile(
      new URL(
        "../supabase/migrations/20260718143000_product_display_name_slug.sql",
        import.meta.url
      ),
      "utf8"
    );
    const action = await readFile(new URL("../app/actions/catalog.ts", import.meta.url), "utf8");
    expect(migration).toContain("admin_update_catalog_product");
    expect(migration).toContain("admin_import_tcgplayer_products");
    expect(migration).toContain("product_inventory");
    expect(migration).toContain("from public, anon, authenticated");
    expect(migration).toContain("to service_role");
    expect(displayNameMigration).toContain("'name', v_name");
    expect(displayNameMigration).toContain("'slug', v_product_slug");
    expect(action).toContain('rpc("admin_update_catalog_product"');
  });
});
