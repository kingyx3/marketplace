import { access, readFile, readdir } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SOURCE_ROOTS = ["app", "lib"];
const SOURCE_SUFFIXES = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"];
const LEGACY_ROUTE_LITERAL = /["'`]\/catalog(?:[/?#]|["'`]|\$\{)/;
const LEGACY_ROUTE_REGEX = /\\\/catalog/;

describe("products storefront route", () => {
  it("ships products pages without legacy catalog route entries", async () => {
    await expect(access(join(ROOT, "app/(shop)/products/page.tsx"))).resolves.toBeUndefined();
    await expect(access(join(ROOT, "app/(shop)/products/[slug]/page.tsx"))).resolves.toBeUndefined();
    await expect(access(join(ROOT, "app/(shop)/catalog/page.tsx"))).rejects.toBeDefined();
    await expect(access(join(ROOT, "app/(shop)/catalog/[slug]/page.tsx"))).rejects.toBeDefined();
  });

  it("does not reference the retired storefront route from application code", async () => {
    const violations: string[] = [];

    for (const root of SOURCE_ROOTS) {
      for (const path of await walk(join(ROOT, root))) {
        if (!SOURCE_SUFFIXES.some((suffix) => path.endsWith(suffix))) continue;
        const source = await readFile(path, "utf8");
        if (LEGACY_ROUTE_LITERAL.test(source) || LEGACY_ROUTE_REGEX.test(source)) {
          violations.push(relative(ROOT, path));
        }
      }
    }

    expect(violations).toEqual([]);
  });
});

async function walk(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const paths = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name);
      return entry.isDirectory() ? walk(path) : [path];
    })
  );
  return paths.flat();
}
