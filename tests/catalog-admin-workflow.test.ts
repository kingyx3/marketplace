import { access, readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("catalog administration workflow", () => {
  it("consolidates hierarchical product intake into operations", async () => {
    const [shell, page, form, action, migration] = await Promise.all([
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
    ]);

    expect(shell).not.toContain('href: "/control/catalog"');
    expect(shell).toContain('href: "/control/operations"');
    expect(shell).toContain('permission: "manage_catalog"');
    expect(shell).not.toContain('href: "/control/categories"');
    expect(shell).not.toContain('href: "/control/sets"');
    expect(page).toContain("ProductIntakeForm");
    expect(page).toContain("Products and SKUs");
    expect(page).toContain("canManageFullOperations");
    expect(page).not.toContain("Quick add category");
    expect(page).not.toContain("Quick add set");
    expect(form).toContain("Step 1");
    expect(form).toContain("Step 2");
    expect(form).toContain("Add category");
    expect(form).toContain("Add set");
    expect(form).toContain('name="newCategorySlug"');
    expect(form).toContain('name="newSetCode"');
    expect(form).toContain('name="setMode"');
    expect(form).toContain("visibleSets");
    expect(form).toContain("useActionState");
    expect(action).toContain('requireControlPermission("manage_catalog", "/control/operations")');
    expect(action).toContain('rpc("admin_create_catalog_product_hierarchy"');
    expect(action).toContain('rpc("admin_upsert_catalog_product"');
    expect(action).toContain('rpc("admin_upsert_booster_box_sku"');
    expect(action).toContain("the product details are preserved");
    expect(migration).toContain("category_created boolean");
    expect(migration).toContain("set_created boolean");
    expect(migration).toContain("CONTROL_CATEGORY_CREATE_INLINE");
    expect(migration).toContain("CONTROL_SET_CREATE_INLINE");
    expect(migration).toContain("active set not found for category");
  });

  it("removes the standalone control catalog route", async () => {
    await expect(
      access(new URL("../app/(shop)/control/catalog/page.tsx", import.meta.url))
    ).rejects.toThrow();
  });

  it("surfaces duplicate category slugs with an available suggestion", async () => {
    const [categoryAction, categoryPage] = await Promise.all([
      readFile(new URL("../app/actions/control.ts", import.meta.url), "utf8"),
      readFile(new URL("../app/(shop)/control/categories/page.tsx", import.meta.url), "utf8"),
    ]);

    expect(categoryAction).toContain("redirectToCategoryConflict");
    expect(categoryAction).toContain('error: "duplicate-category"');
    expect(categoryAction).toContain("while (used.has");
    expect(categoryPage).toContain("already used by");
    expect(categoryPage).toContain("use a unique slug such as");
  });
});
