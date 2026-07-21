import { readdir, readFile } from "node:fs/promises";
import { extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const runtimeRoots = ["app", "lib", "scripts"];
const sourceExtensions = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);

describe("HitPay runtime migration", () => {
  it("does not retain Stripe references in runtime source", async () => {
    const offenders: string[] = [];

    for (const root of runtimeRoots) {
      for (const path of await sourceFiles(join(repoRoot, root))) {
        const source = await readFile(path, "utf8");
        if (/\bstripe\b/i.test(source)) {
          offenders.push(relative(repoRoot, path));
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});

async function sourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await sourceFiles(path)));
      continue;
    }
    if (entry.isFile() && sourceExtensions.has(extname(entry.name))) {
      files.push(path);
    }
  }

  return files;
}
