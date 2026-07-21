import { readdir, readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { describe, expect, it } from "vitest";

import { resolveSupabaseSecretKey } from "@/lib/supabase";

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const deprecatedKey = ["SUPABASE", "SERVICE", "ROLE", "KEY"].join("_");
const deprecatedClients = [
  ["create", "Service", "Client"].join(""),
  ["create", "Anon", "Client"].join(""),
];

describe("Supabase server key contract", () => {
  it("normalizes the canonical secret key", () => {
    expect(resolveSupabaseSecretKey({ SUPABASE_SECRET_KEY: " sb_secret_current " })).toBe(
      "sb_secret_current"
    );
  });

  it("does not accept deprecated environment aliases", () => {
    expect(resolveSupabaseSecretKey({ [deprecatedKey]: "obsolete-key" })).toBe("");
  });

  it("returns an empty value when the canonical key is absent", () => {
    expect(resolveSupabaseSecretKey({})).toBe("");
  });

  it("keeps runtime and deployment configuration free of the deprecated key", async () => {
    const files = await Promise.all(
      [
        "lib/supabase.ts",
        "lib/readiness.ts",
        ".github/workflows/bootstrap-environment.yml",
        ".github/workflows/deploy.yml",
        ".github/workflows/hosted-release-gates.yml",
      ].map(read)
    );

    for (const file of files) {
      expect(file).not.toContain(deprecatedKey);
    }
  });

  it("uses explicit Supabase client names throughout application code", async () => {
    const files = await sourceFiles(["app", "lib", "tests"]);
    for (const path of files) {
      const content = await read(path);
      for (const name of deprecatedClients) expect(content).not.toContain(name);
    }
  });
});

async function sourceFiles(roots: string[]): Promise<string[]> {
  const files: string[] = [];
  const extensions = new Set([".ts", ".tsx", ".mjs"]);

  async function walk(directory: string): Promise<void> {
    const entries = await readdir(new URL(`../${directory}/`, import.meta.url), {
      withFileTypes: true,
    });
    for (const entry of entries) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (extensions.has(extname(path))) files.push(path);
    }
  }

  for (const root of roots) await walk(root);
  return files;
}
