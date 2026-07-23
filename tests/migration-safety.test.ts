import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFile(new URL(`../${path}`, import.meta.url), "utf8");

describe("migration deployment safety", () => {
  it("gates destructive production migrations behind explicit approval", async () => {
    const script = await read("scripts/check-migration-safety.mjs");
    const workflow = await read(".github/workflows/deploy.yml");

    expect(script).toContain("ALLOW_DESTRUCTIVE_MIGRATIONS");
    expect(script).toContain("deployment-safety: destructive-approved");
    expect(workflow).toContain("check-migration-safety.mjs");
  });

  it("runs one recovery worker against the PostgreSQL-backed queues", async () => {
    const workflow = await read(".github/workflows/commerce-worker.yml");
    expect(workflow).toContain('cron: "*/5 * * * *"');
    expect(workflow).toContain("/api/cron/commerce-worker");
    expect(workflow).toContain("CRON_SECRET");
  });
});
