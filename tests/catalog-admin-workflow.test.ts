import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("catalog administration workflow", () => {
  it("creates draft products through the dedicated Catalog hierarchy flow", async () => {
    const [page, form, fields, action] = await Promise.all([
      readFile(
        new URL("../app/(shop)/control/catalog/products/new/page.tsx", import.meta.url),
        "utf8"
      ),
      readFile(
        new URL("../app/(shop)/control/_components/product-intake-form.tsx", import.meta.url),
        "utf8"
      ),
      readFile(
        new URL("../app/(shop)/control/_components/admin-form-fields.tsx", import.meta.url),
        "utf8"
      ),
      readFile(new URL("../app/actions/catalog.ts", import.meta.url), "utf8"),
    ]);

    expect(page).toContain("ProductIntakeForm");
    expect(page).toContain("fetchControlProductTypes");
    expect(form).toContain("Step 1");
    expect(form).toContain("Step 2");
    expect(form).toContain("Add category");
    expect(form).toContain("Add set");
    expect(form).toContain("Add type");
    expect(form).toContain('name="name"');
    expect(form).not.toContain('name="published"');
    expect(form).not.toContain('name="slug"');
    expect(form).toContain("Generated slug:");
    expect(form).toContain("This slug is already in use");
    expect(fields).toContain('aria-label="required"');
    expect(fields).toContain('aria-live="polite"');
    expect(action).toContain('requireControlPermission("catalog.manage", "/control/catalog")');
    expect(action).toContain('rpc("admin_create_catalog_product_hierarchy"');
    expect(action).not.toContain("with_publication");
    expect(action).not.toContain("p_published");
    expect(action).toContain("redirect(`/control/catalog/products/${createdProductId}`)");
  });

  it("keeps editable product and SKU details inside Catalog", async () => {
    const [detail, detailsEditor, skuEditor] = await Promise.all([
      readFile(
        new URL("../app/(shop)/control/catalog/products/[productId]/page.tsx", import.meta.url),
        "utf8"
      ),
      readFile(
        new URL(
          "../app/(shop)/control/_components/catalog-product-details-editor.tsx",
          import.meta.url
        ),
        "utf8"
      ),
      readFile(
        new URL("../app/(shop)/control/_components/catalog-product-editor.tsx", import.meta.url),
        "utf8"
      ),
    ]);
    expect(detail).toContain("ProductListingWorkflow");
    expect(detail).toContain("CatalogProductDetailsEditor");
    expect(detail).toContain("CatalogSkuManager");
    expect(detailsEditor).toContain("ProductImageUploader");
    expect(skuEditor).toContain("upsertCatalogSku");
    expect(skuEditor).toContain("Add SKU");
    expect(skuEditor).not.toContain('name="priceCents"');
    expect(skuEditor).not.toContain('name="published"');
  });

  it("surfaces duplicate generated category slugs without leaving or clearing the form", async () => {
    const [categoryAction, form] = await Promise.all([
      readFile(new URL("../app/actions/control.ts", import.meta.url), "utf8"),
      readFile(
        new URL("../app/(shop)/control/_components/category-form.tsx", import.meta.url),
        "utf8"
      ),
    ]);
    expect(categoryAction).toContain("categoryConflictResult");
    expect(categoryAction).toContain("fieldErrors: {\n      name:");
    expect(categoryAction).not.toContain("redirectToCategoryConflict");
    expect(form).toContain("ControlActionForm");
    expect(form).toContain("externalError={error}");
    expect(form).not.toContain('name="slug"');
  });
});
