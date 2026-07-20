import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const PRODUCT_QUERY_FILES = [
  "app/(shop)/products/page.tsx",
  "lib/catalog.ts",
  "lib/control-catalog.ts",
];

describe("storefront product relationships", () => {
  it("disambiguates every product-to-set embed after the composite foreign key was added", async () => {
    const migration = await readFile(
      "supabase/migrations/20260720113000_harden_admin_value_contracts.sql",
      "utf8"
    );
    expect(migration).toContain("constraint products_set_belongs_to_category");

    for (const file of PRODUCT_QUERY_FILES) {
      const source = await readFile(file, "utf8");
      expect(source, file).toContain("sets_releases!products_set_belongs_to_category(");
      expect(source, file).not.toMatch(/(^|\s)sets_releases\(/);
    }
  });
});
