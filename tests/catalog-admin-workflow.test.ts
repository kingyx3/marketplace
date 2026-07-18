import { access, readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("catalog administration workflow", () => {
  it("consolidates hierarchical product intake into operations", async () => {
    const [shell, page, form, action, hierarchyMigration, identityMigration] = await Promise.all([
      readFile(
        new URL("../app/(shop)/control/_components/control-shell.tsx", import.meta.url),
        "utf8"
      ),
      readFile(new URL("../app/(shop)/control/operations/page.tsx", import.meta.url), "utf8"),
      readFile(
        new URL("../app/(shop)/control/_components/product-intake-form.tsx", import.meta.url),
        "utf8"
      ),
      readFile(new URL("../app/actions/catalog.ts", import.meta.url), "utf8"),
      readFile(
        new URL(
          "../supabase/migrations/20260717180000_hierarchical_catalog_product_flow.sql",
          import.meta.url
        ),
        "utf8"
      ),
      readFile(
        new URL(
          "../supabase/migrations/20260717223000_product_types_and_derived_product_identity.sql",
          import.meta.url
        ),
        "utf8"
      ),
    ]);

    expect(shell).not.toContain('href: "/control/catalog"');
    expect(shell).toContain('href: "/control/operations"');
    expect(shell).toContain('permission: "manage_catalog"');
    expect(shell).not.toContain('href: "/control/categories"');
    expect(shell).not.toContain('href: "/control/sets"');
    expect(page).toContain("ProductIntakeForm");
    expect(page).toContain("Products and SKUs");
    expect(page).toContain("canManageFullOperations");
    expect(page).toContain('from("product_types")');
    expect(page).not.toContain("Quick add category");
    expect(page).not.toContain("Quick add set");
    expect(form).toContain("Step 1");
    expect(form).toContain("Step 2");
    expect(form).toContain("Add category");
    expect(form).toContain("Add set");
    expect(form).toContain("Add type");
    expect(form).not.toContain('name="name"');
    expect(form).not.toContain('name="slug"');
    expect(form).not.toContain('name="newCategorySlug"');
    expect(form).not.toContain('name="newSetCode"');
    expect(form).toContain(
      "The display name and slug are generated from category, set, type, and language."
    );
    expect(form).toContain("Slug is generated automatically from the category name.");
    expect(form).toContain("Code is generated automatically from the set name.");
    expect(form).toContain("A reusable dropdown code is generated automatically from this name.");
    expect(form).toContain('name="setMode"');
    expect(form).toContain('name="productTypeMode"');
    expect(form).toContain("visibleSets");
    expect(form).toContain("useActionState");
    expect(action).toContain('requireControlPermission("manage_catalog", "/control/operations")');
    expect(action).toContain('rpc("admin_create_catalog_product_hierarchy"');
    expect(action).toContain('rpc("admin_upsert_catalog_product"');
    expect(action).toContain('rpc("admin_upsert_booster_box_sku"');
    expect(action).toContain("the other product details are preserved");
    expect(hierarchyMigration).toContain("category_created boolean");
    expect(hierarchyMigration).toContain("set_created boolean");
    expect(identityMigration).toContain("CONTROL_CATEGORY_CREATE_INLINE");
    expect(identityMigration).toContain("CONTROL_SET_CREATE_INLINE");
    expect(identityMigration).toContain("CONTROL_PRODUCT_TYPE_CREATE_INLINE");
    expect(identityMigration).toContain("active set not found for category");
    expect(identityMigration).toContain("create table public.product_types");
    expect(identityMigration).toContain("alter column set_id set not null");
    expect(identityMigration).not.toContain("General");
    expect(identityMigration).not.toContain("where product.set_id is null");
    expect(identityMigration).not.toContain("select distinct\n  lower(trim(product.product_type))");
    expect(identityMigration).not.toContain("create table if not exists public.product_types");
  });

  it("removes the standalone control catalog route", async () => {
    await expect(
      access(new URL("../app/(shop)/control/catalog/page.tsx", import.meta.url))
    ).rejects.toThrow();
  });

  it("surfaces duplicate generated category slugs through the source name", async () => {
    const [categoryAction, categoryPage] = await Promise.all([
      readFile(new URL("../app/actions/control.ts", import.meta.url), "utf8"),
      readFile(new URL("../app/(shop)/control/categories/page.tsx", import.meta.url), "utf8"),
    ]);

    expect(categoryAction).toContain("redirectToCategoryConflict");
    expect(categoryAction).toContain('error: "duplicate-category"');
    expect(categoryAction).not.toContain("while (used.has");
    expect(categoryPage).toContain("generates the same slug as");
    expect(categoryPage).toContain("Rename the category or edit the existing category instead.");
    expect(categoryPage).not.toContain('name="slug"');
  });
});
