import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const migrationPath =
  "../supabase/migrations/20260717222000_collapse_duplicate_product_identities.sql";

describe("canonical duplicate product migration", () => {
  it("collapses duplicate identities before generated slugs are applied", async () => {
    const source = await readFile(new URL(migrationPath, import.meta.url), "utf8");

    expect(source).toContain("partition by");
    expect(source).toContain("lower(trim(product.product_type))");
    expect(source).toContain("upper(trim(coalesce(product.language, 'EN')))");
    expect(source).toContain("where product_id <> survivor_product_id");
    expect(source).toContain("delete from public.products");
  });

  it("preserves sellable and storefront relationships while merging", async () => {
    const source = await readFile(new URL(migrationPath, import.meta.url), "utf8");

    expect(source).toContain("insert into public.listing_items as current_listing");
    expect(source).toContain("on conflict (product_id) do update");
    expect(source).toContain("update public.booster_box_skus");
    expect(source).toContain("update public.product_variants");
    expect(source).toContain("CATALOG_PRODUCT_DUPLICATE_COLLAPSE");
  });
});
