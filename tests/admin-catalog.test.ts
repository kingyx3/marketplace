import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  adminCatalogProductCreateFromForm,
  adminCatalogProductFromForm,
  adminCatalogSkuFromForm,
  adminInventoryAdjustmentFromForm,
} from "@/lib/admin-catalog-forms";

describe("admin catalog management", () => {
  it("parses product create/update forms with normalized slug and language", () => {
    const form = new FormData();
    form.set("categoryId", "22222222-2222-4222-8222-222222222222");
    form.set("setId", "33333333-3333-4333-8333-333333333333");
    form.set("slug", "sample-box");
    form.set("name", "Sample Box");
    form.set("productType", "booster_box");
    form.set("description", "A sealed display box");
    form.set("language", "en");
    form.set("imageUrl", "https://example.test/image.png");
    form.set("active", "true");

    expect(adminCatalogProductFromForm(form)).toMatchObject({
      categoryId: "22222222-2222-4222-8222-222222222222",
      setId: "33333333-3333-4333-8333-333333333333",
      slug: "sample-box",
      name: "Sample Box",
      productType: "booster_box",
      language: "EN",
      active: true,
    });
  });

  it("parses atomic category and set creation in hierarchical order", () => {
    const form = new FormData();
    form.set("categoryMode", "new");
    form.set("newCategoryName", "Example Game");
    form.set("newCategorySlug", "example-game");
    form.set("newCategoryPublisher", "Example Publisher");
    form.set("setMode", "new");
    form.set("newSetName", "First Release");
    form.set("newSetCode", "fr-01");
    form.set("newSetReleaseDate", "2026-08-01");
    form.set("newSetStatus", "preorder_open");
    form.set("slug", "first-release-booster-box");
    form.set("name", "First Release Booster Box");
    form.set("productType", "booster_box");
    form.set("language", "en");
    form.set("active", "true");

    expect(adminCatalogProductCreateFromForm(form)).toMatchObject({
      categoryId: null,
      newCategoryName: "Example Game",
      newCategorySlug: "example-game",
      newCategoryPublisher: "Example Publisher",
      setId: null,
      newSetName: "First Release",
      newSetCode: "FR-01",
      newSetReleaseDate: "2026-08-01",
      newSetStatus: "preorder_open",
      slug: "first-release-booster-box",
      language: "EN",
    });
  });

  it("requires an existing set to follow an existing category", () => {
    const form = new FormData();
    form.set("categoryMode", "new");
    form.set("newCategoryName", "Example Game");
    form.set("newCategorySlug", "example-game");
    form.set("setMode", "existing");
    form.set("setId", "33333333-3333-4333-8333-333333333333");
    form.set("slug", "sample-box");
    form.set("name", "Sample Box");
    form.set("productType", "booster_box");

    expect(() => adminCatalogProductCreateFromForm(form)).toThrow(
      "Create or select the category before choosing an existing set"
    );
  });

  it("rejects unsafe product slugs and malformed SKU currency", () => {
    const product = new FormData();
    product.set("categoryId", "22222222-2222-4222-8222-222222222222");
    product.set("slug", "Bad Slug");
    product.set("name", "Sample Box");
    product.set("productType", "booster_box");

    expect(() => adminCatalogProductFromForm(product)).toThrow(
      "slug must use lowercase words separated by hyphens"
    );

    const sku = new FormData();
    sku.set("productId", "11111111-1111-4111-8111-111111111111");
    sku.set("sku", "box-1");
    sku.set("priceCents", "19900");
    sku.set("currency", "SG");

    expect(() => adminCatalogSkuFromForm(sku)).toThrow("currency must be a 3-letter code");
  });

  it("requires reason-coded non-negative inventory adjustments", () => {
    const form = new FormData();
    form.set("skuId", "11111111-1111-4111-8111-111111111111");
    form.set("onHand", "2");
    form.set("incoming", "10");
    form.set("safetyStock", "1");
    form.set("reasonCode", "stock_count");
    form.set("reasonNote", "Cycle count");

    expect(adminInventoryAdjustmentFromForm(form)).toEqual({
      skuId: "11111111-1111-4111-8111-111111111111",
      onHand: 2,
      incoming: 10,
      safetyStock: 1,
      reasonCode: "stock_count",
      reasonNote: "Cycle count",
    });

    form.set("reasonCode", "surprise");
    expect(() => adminInventoryAdjustmentFromForm(form)).toThrow(
      "invalid inventory reason code"
    );
  });

  it("keeps catalog admin mutations service-role-only and audited", async () => {
    const migration = await readFile(
      new URL("../supabase/migrations/20260705020250_admin_catalog_crud.sql", import.meta.url),
      "utf8"
    );

    expect(migration).toContain("add column if not exists active boolean");
    expect(migration).toContain("admin_upsert_catalog_product");
    expect(migration).toContain("admin_upsert_booster_box_sku");
    expect(migration).toContain("admin_set_product_image");
    expect(migration).toContain("admin_adjust_inventory");
    expect(migration).toContain("ADMIN_INVENTORY_ADJUSTMENT");
    expect(migration).toContain("and s.active");
    expect(migration).toContain("from public, anon, authenticated");
    expect(migration).toContain("to service_role");
  });
});
