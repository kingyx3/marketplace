import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("product save feedback", () => {
  it("keeps Catalog edits controlled and explicitly leaves publication unchanged", async () => {
    const [editor, form, action] = await Promise.all([
      readFile(
        new URL(
          "../app/(shop)/control/_components/catalog-product-details-editor.tsx",
          import.meta.url
        ),
        "utf8"
      ),
      readFile(
        new URL("../app/(shop)/control/_components/catalog-product-save-form.tsx", import.meta.url),
        "utf8"
      ),
      readFile(new URL("../app/actions/catalog-product-save.ts", import.meta.url), "utf8"),
    ]);
    expect(editor).toContain("CatalogProductSaveForm");
    expect(form).toContain("useActionState");
    expect(form).not.toContain("checked={published}");
    expect(form).toContain('role={state.status === "error" ? "alert" : "status"}');
    expect(action).toContain("Pricing and storefront publication remain unchanged");
    expect(action).toContain('rpc("admin_update_catalog_product"');
    expect(action).not.toContain("with_publication");
  });
});
