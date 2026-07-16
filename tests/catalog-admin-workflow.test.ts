import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("catalog administration workflow", () => {
  it("consolidates product intake and inline category creation", async () => {
    const [shell, page, form, action, migration] = await Promise.all([
      readFile(
        new URL("../app/(shop)/control/_components/control-shell.tsx", import.meta.url),
        "utf8"
      ),
      readFile(new URL("../app/(shop)/control/catalog/page.tsx", import.meta.url), "utf8"),
      readFile(
        new URL("../app/(shop)/control/_components/product-intake-form.tsx", import.meta.url),
        "utf8"
      ),
      readFile(new URL("../app/actions/catalog.ts", import.meta.url), "utf8"),
      readFile(
        new URL(
          "../supabase/migrations/20260717153000_consolidated_catalog_product_flow.sql",
          import.meta.url
        ),
        "utf8"
      ),
    ]);

    expect(shell).toContain('href: "/control/catalog"');
    expect(shell).not.toContain('href: "/control/categories"');
    expect(shell).not.toContain('href: "/control/sets"');
    expect(page).toContain("ProductIntakeForm");
    expect(page).toContain("Quick add category");
    expect(page).toContain("Quick add set");
    expect(form).toContain("Add category");
    expect(form).toContain('name="newCategorySlug"');
    expect(form).toContain("useActionState");
    expect(action).toContain('rpc("admin_create_catalog_product_with_category"');
    expect(action).toContain("the other product details are preserved");
    expect(migration).toContain("category_created boolean");
    expect(migration).toContain("CONTROL_CATEGORY_CREATE_INLINE");
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
