import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

import { resolveSupabaseSecretKey } from "@/lib/supabase";

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const deprecatedKey = ["SUPABASE", "SERVICE", "ROLE", "KEY"].join("_");

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
});
