import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("product publication save migration", () => {
  it("uses the listing product unique constraint instead of an ambiguous product_id target", async () => {
    const migration = await readFile(
      new URL(
        "../supabase/migrations/20260719163000_fix_product_publication_product_id_ambiguity.sql",
        import.meta.url
      ),
      "utf8"
    );

    expect(migration).toContain(
      "create or replace function public.admin_create_catalog_product_with_publication"
    );
    expect(migration).toContain(
      "create or replace function public.admin_upsert_catalog_product_with_publication"
    );
    expect(migration.match(/on conflict on constraint listing_items_product_id_key/g)).toHaveLength(
      2
    );
    expect(migration).not.toContain("on conflict (product_id)");
  });
});
