import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

function repoFile(path: string): URL {
  return new URL(`../${path}`, import.meta.url);
}

async function readWorkflow(path: string): Promise<string> {
  return readFile(repoFile(path), "utf8");
}

describe("deployment workflow contract", () => {
  it("blocks mutable deploy work behind app and migration checks", async () => {
    const workflow = await readWorkflow(".github/workflows/deploy.yml");

    expect(workflow).toContain("app-checks:");
    expect(workflow).toContain("migration-check:");
    expect(workflow).toContain("needs: [validate-env, migration-check]");
    expect(workflow).toContain("needs: [app-checks, migrate]");
    expect(workflow).toContain("TARGET_ENV:");
    expect(workflow).toContain("APP_NAME:");
    expect(workflow).toContain("Validate GitHub Environment contract");
    expect(workflow).toContain("Generate runtime env from GitHub");
    expect(workflow).toContain("node scripts/generate-env.mjs --write .env.deploy");
    expect(workflow).toContain("Sync runtime env to Vercel");
    expect(workflow).toContain("node scripts/sync-vercel-env.mjs .env.deploy");
    expect(workflow).not.toContain("npx vercel pull");
    expect(workflow).toContain("Deep readiness check");
    expect(workflow).toContain("$URL/api/health?deep=1");
  });

  it("maps deployment callers to the active GitHub Environments", async () => {
    const development = await readWorkflow(".github/workflows/deploy-development.yml");
    const production = await readWorkflow(".github/workflows/deploy-production.yml");

    expect(development).toContain("environment: development");
    expect(development).toContain("branches-ignore: [main]");
    expect(production).toContain("environment: production");
    expect(production).toContain("types: [published]");
  });

  it("keeps bootstrap separate from regular deployment", async () => {
    const bootstrap = await readWorkflow(".github/workflows/bootstrap-environment.yml");

    expect(bootstrap).toContain("workflow_dispatch:");
    expect(bootstrap).toContain("options: [development, production]");
    expect(bootstrap).toContain("Sync runtime env to Vercel");
    expect(bootstrap).toContain("Apply Supabase migrations");
    expect(bootstrap).not.toContain("uses: ./.github/workflows/deploy.yml");
    expect(bootstrap).not.toContain("npx vercel deploy");
  });
});
