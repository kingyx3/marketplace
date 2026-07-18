import { access, readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("catalog administration workflow", () => {
  it("consolidates hierarchical product intake into operations", async () => {
    const [
      shell,
      page,
      form,
      fields,
      action,
      hierarchyMigration,
      identityMigration,
      displayNameMigration,
      normalizationMigration,
    ] = await Promise.all([
      readFile(
        new URL("../app/(shop)/control/_components/control-shell.tsx", import.meta.url),
        "utf8"
      ),
      readFile(new URL("../app/(shop)/control/operations/page.tsx", import.meta.url), "utf8"),
      readFile(
        new URL("../app/(shop)/control/_components/product-intake-form.tsx", import.meta.url),
        "utf8"
      ),
      readFile(
        new URL("../app/(shop)/control/_components/admin-form-fields.tsx", import.meta.url),
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
      readFile(
        new URL(
          "../supabase/migrations/20260718143000_product_display_name_slug.sql",
          import.meta.url
        ),
        "utf8"
      ),
      readFile(
        new URL(
          "../supabase/migrations/20260718143100_align_product_slug_normalization.sql",
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
    expect(page).toContain('existingSlugs={products.map((product) => product.slug)}');
    expect(page).toContain('label="Display name"');
    expect(page).not.toContain("Quick add category");
    expect(page).not.toContain("Quick add set");
    expect(form).toContain("Step 1");
    expect(form).toContain("Step 2");
    expect(form).toContain("Add category");
    expect(form).toContain("Add set");
    expect(form).toContain("Add type");
    expect(form).toContain('name="name"');
    expect(form).not.toContain('name="slug"');
    expect(form).not.toContain('name="newCategorySlug"');
    expect(form).not.toContain('name="newSetCode"');
    expect(form).toContain("The display name is customer-facing.");
    expect(form).toContain("Generated slug:");
    expect(form).toContain("existingSlugs.includes(generatedSlug)");
    expect(form).toContain("This slug is already in use");
    expect(form).toContain("The category slug is generated automatically from this name.");
    expect(form).toContain("The reusable set code is generated automatically from this name.");
    expect(form).toContain("A reusable dropdown code is generated automatically from this name.");
    expect(form).toContain('name="setMode"');
    expect(form).toContain('name="productTypeMode"');
    expect(form).toContain("visibleSets");
    expect(form).toContain("useActionState");
    expect(fields).toContain('aria-label="required"');
    expect(fields).toContain("text-rose-600");
    expect(fields).toContain("Example: {example}");
    expect(fields).toContain('aria-live="polite"');
    expect(fields).toContain("validity.typeMismatch");
    expect(fields).toContain("validity.patternMismatch");
    expect(fields).toContain("validity.rangeUnderflow");
    expect(action).toContain('requireControlPermission("manage_catalog", "/control/operations")');
    expect(action).toContain('rpc("admin_create_catalog_product_hierarchy"');
    expect(action).toContain('rpc("admin_upsert_catalog_product"');
    expect(action).toContain('rpc("admin_upsert_booster_box_sku"');
    expect(action).toContain("p_name: input.name");
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
    expect(displayNameMigration).toContain("catalog_slug_from_name");
    expect(displayNameMigration).toContain("new.name := v_name");
    expect(displayNameMigration).toContain("new.slug := v_slug");
    expect(displayNameMigration).toContain("product display name generates a slug already used");
    expect(displayNameMigration).toContain(
      "drop trigger if exists refresh_product_identity_from_category"
    );
    expect(displayNameMigration).toContain("p_name text");
    expect(normalizationMigration).toContain("create extension if not exists unaccent");
    expect(normalizationMigration).toContain("set search_path = public, extensions");
    expect(normalizationMigration).toContain("unaccent(trim(p_value))");
  });

  it("standardizes catalog admin input guidance and validation", async () => {
    const [operations, categories, sets] = await Promise.all([
      readFile(new URL("../app/(shop)/control/operations/page.tsx", import.meta.url), "utf8"),
      readFile(new URL("../app/(shop)/control/categories/page.tsx", import.meta.url), "utf8"),
      readFile(new URL("../app/(shop)/control/sets/page.tsx", import.meta.url), "utf8"),
    ]);

    for (const page of [operations, categories, sets]) {
      expect(page).toContain("AdminTextField");
      expect(page).toContain("example=");
      expect(page).toContain("required");
    }
    expect(operations).toContain("AdminNumberField");
    expect(operations).toContain("AdminSelectField");
    expect(operations).toContain("AdminFileField");
    expect(categories).toContain("AdminTextareaField");
    expect(sets).toContain('type="datetime-local"');
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
