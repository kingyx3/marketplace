import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

describe("hosted migration deployment ordering", () => {
  it("includes all unapplied migrations even when remote history has newer entries", async () => {
    const workflow = await read(".github/workflows/deploy.yml");

    expect(workflow).toContain('npx --yes "supabase@$SUPABASE_CLI" db push --include-all');
  });
});
