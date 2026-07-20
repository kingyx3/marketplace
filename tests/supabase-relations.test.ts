import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

import { toOne } from "@/lib/supabase-relations";

describe("Supabase relationship normalization", () => {
  it("accepts both object and array shapes for one-to-one relationships", () => {
    const listing = { published: true };

    expect(toOne(listing)).toBe(listing);
    expect(toOne([listing])).toBe(listing);
    expect(toOne([])).toBeNull();
    expect(toOne(null)).toBeNull();
  });

  it("uses one-to-one normalization wherever listing publication is read", async () => {
    const [controlCatalog, catalog, productsPage, listingsPage] = await Promise.all([
      readFile(new URL("../lib/control-catalog.ts", import.meta.url), "utf8"),
      readFile(new URL("../lib/catalog.ts", import.meta.url), "utf8"),
      readFile(new URL("../app/(shop)/products/page.tsx", import.meta.url), "utf8"),
      readFile(new URL("../app/(shop)/control/listings/page.tsx", import.meta.url), "utf8"),
    ]);

    for (const source of [controlCatalog, catalog, productsPage, listingsPage]) {
      expect(source).toContain("toOne(");
    }

    expect(controlCatalog).not.toContain("listing_items?.[0]");
    expect(catalog).not.toContain("listing_items?.[0]");
    expect(productsPage).not.toContain("listing_items?.[0]");
    expect(listingsPage).not.toContain("listing_items?.[0]");
  });
});
