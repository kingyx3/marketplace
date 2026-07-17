import { describe, expect, it } from "vitest";

import { setCodeFromName, slugFromName } from "@/lib/catalog-identifiers";
import { controlCategoryFromForm, controlSetFromForm } from "@/lib/control-forms";

describe("catalog identifiers", () => {
  it("creates lowercase hyphenated slugs without spaces", () => {
    expect(slugFromName("  Pokémon & Friends: Collector's Box  ")).toBe(
      "pokemon-friends-collectors-box"
    );
    expect(slugFromName("Multiple     spaces --- and punctuation!!!")).toBe(
      "multiple-spaces-and-punctuation"
    );
  });

  it("creates compact uppercase set codes from names", () => {
    expect(setCodeFromName("First Release")).toBe("FIRST-RELEASE");
    expect(setCodeFromName("A Very Long Set Name That Exceeds Limit")).toBe(
      "A-VERY-LONG-SET"
    );
    expect(setCodeFromName("A")).toBe("A-1");
  });

  it("derives identifiers in detailed category and set forms", () => {
    const category = new FormData();
    category.set("name", "Pokémon Cards");
    category.set("slug", "manual-value-is-ignored");
    category.set("sortOrder", "0");
    category.set("active", "true");

    expect(controlCategoryFromForm(category)).toMatchObject({
      name: "Pokémon Cards",
      slug: "pokemon-cards",
    });

    const set = new FormData();
    set.set("categoryId", "22222222-2222-4222-8222-222222222222");
    set.set("name", "Scarlet & Violet");
    set.set("code", "MANUAL-CODE");
    set.set("status", "announced");
    set.set("sortOrder", "0");
    set.set("active", "true");

    expect(controlSetFromForm(set)).toMatchObject({
      name: "Scarlet & Violet",
      code: "SCARLET-VIOLET",
    });
  });
});
