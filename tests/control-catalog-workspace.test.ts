import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

import {
  catalogProductNeedsAttention,
  catalogProductNextStep,
  matchesCatalogProduct,
  parseCatalogLifecycle,
  parseCatalogProductSort,
  parseCatalogPublication,
  parseCatalogReference,
  sortCatalogProducts,
} from "@/lib/control-catalog-view";
import type { ControlProductRow } from "@/lib/control-catalog";

describe("control catalog workspace", () => {
  it("normalizes supported directory controls and rejects stale values", () => {
    expect(parseCatalogLifecycle("archived")).toBe("archived");
    expect(parseCatalogLifecycle("disabled")).toBe("all");
    expect(parseCatalogReference("missing")).toBe("missing");
    expect(parseCatalogReference("unknown")).toBe("all");
    expect(parseCatalogPublication("published")).toBe("published");
    expect(parseCatalogPublication("live")).toBe("all");
    expect(parseCatalogProductSort("reference")).toBe("reference");
    expect(parseCatalogProductSort("newest")).toBe("attention");
  });

  it("searches recognizable labels and exact catalog identifiers", () => {
    const product = buildProduct();
    for (const query of [
      "Booster",
      "product-1",
      "booster-box",
      "SKU-001",
      "88880001",
      "Pokémon",
      "Journey Together",
      "JTG",
    ]) {
      expect(matchesCatalogProduct(product, query), query).toBe(true);
    }
    expect(matchesCatalogProduct(product, "unrelated")).toBe(false);
  });

  it("prioritizes active records requiring catalog-owned setup", () => {
    const ready = buildProduct({ id: "ready", published: true });
    const unpriced = buildProduct({ id: "unpriced", priceCents: 0 });
    const missingReference = buildProduct({ id: "missing", referenceCode: null });
    const archived = buildProduct({ id: "archived", active: false });
    expect(
      sortCatalogProducts([ready, archived, unpriced, missingReference], "attention").map(
        (p) => p.id
      )
    ).toEqual(["missing", "unpriced", "ready", "archived"]);
    expect(catalogProductNeedsAttention(missingReference)).toBe(true);
    expect(catalogProductNeedsAttention(archived)).toBe(false);
    expect(catalogProductNextStep(missingReference)).toBe("Add product reference");
    expect(catalogProductNextStep(unpriced)).toBe("Continue to Pricing");
  });

  it("ships active filters, identifiers, exact states, and bounded pagination", async () => {
    const source = await readFile(
      new URL("../app/(shop)/control/catalog/page.tsx", import.meta.url),
      "utf8"
    );

    expect(source).toContain('aria-label="Active catalog filters"');
    expect(source).toContain('name="lifecycle"');
    expect(source).toContain('name="reference"');
    expect(source).toContain('name="publication"');
    expect(source).toContain('name="sort"');
    expect(source).toContain("Product ID");
    expect(source).toContain("Product reference");
    expect(source).toContain("Barcode");
    expect(source).toContain("Set code");
    expect(source).toContain("System:");
    expect(source).toContain("Current price");
    expect(source).toContain("const PAGE_SIZE = 24");
    expect(source).toContain("latest 100 products");
  });

  it("keeps product mutations permission-gated on the detail page", async () => {
    const source = await readFile(
      new URL("../app/(shop)/control/catalog/products/[productId]/page.tsx", import.meta.url),
      "utf8"
    );
    expect(source).toContain('hasControlPermission(staff, "catalog.manage")');
    expect(source).toContain("<CatalogProductEditor");
    expect(source).toContain('label="Product ID"');
    expect(source).toContain('label="Barcode"');
    expect(source).toContain('label="Set code"');
  });
});

function buildProduct(overrides: Partial<ControlProductRow> = {}): ControlProductRow {
  return {
    id: "product-1",
    categoryId: "category-1",
    categoryName: "Pokémon",
    setId: "set-1",
    setName: "Journey Together",
    setCode: "JTG",
    slug: "booster-box",
    name: "Booster Box",
    productType: "booster_box",
    description: null,
    language: "English",
    imageUrl: null,
    active: true,
    published: false,
    referenceCode: "SKU-001",
    barcode: "88880001",
    packsPerBox: 36,
    cardsPerPack: 10,
    compareAtCents: null,
    priceCents: 19900,
    currency: "SGD",
    weightGrams: null,
    ...overrides,
  };
}
