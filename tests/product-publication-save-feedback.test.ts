import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("product publication save feedback", () => {
  it("keeps editor values controlled and surfaces save results", async () => {
    const [editor, form, action, migration] = await Promise.all([
      readFile(
        new URL(
          "../app/(shop)/control/_components/catalog-product-details-editor.tsx",
          import.meta.url
        ),
        "utf8"
      ),
      readFile(
        new URL(
          "../app/(shop)/control/_components/catalog-product-save-form.tsx",
          import.meta.url
        ),
        "utf8"
      ),
      readFile(new URL("../app/actions/catalog-product-save.ts", import.meta.url), "utf8"),
      readFile(
        new URL(
          "../supabase/migrations/20260720090000_harden_product_publication_save.sql",
          import.meta.url
        ),
        "utf8"
      ),
    ]);

    expect(editor).toContain("CatalogProductSaveForm");
    expect(form).toContain("useActionState");
    expect(form).toContain("checked={published}");
    expect(form).toContain('role={state.status === "error" ? "alert" : "status"}');
    expect(form).toContain('pending ? "Saving product…" : "Save product"');

    expect(action).toContain("Publication is enabled");
    expect(action).toContain("active SKU with a positive price");
    expect(action).toContain("Product publication could not be saved");
    expect(action).toContain("catalog.product_save_failed");

    expect(migration).toContain("returns uuid");
    expect(migration).not.toContain("returns table (product_id uuid)");
    expect(migration).toContain(
      "on conflict on constraint listing_items_product_id_key do update"
    );
  });
});
