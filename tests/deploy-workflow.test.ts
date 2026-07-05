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
    expect(workflow).toContain("TARGET_ENV: ${{ inputs.environment }}");
    expect(workflow).toContain("Validate minimal GitHub deploy environment");
    expect(workflow).toContain("npx vercel pull");
    expect(workflow).toContain("node scripts/generate-env.mjs --check");
    expect(workflow).not.toContain("vercel env add");
    expect(workflow).not.toContain("vercel env rm");
    expect(workflow).not.toContain("Sync runtime env to Vercel");
    expect(workflow).toContain("Deep readiness check");
    expect(workflow).toContain("$URL/api/health?deep=1");
  });

  it("maps deployment callers to the expected GitHub Environments", async () => {
    const development = await readWorkflow(".github/workflows/deploy-development.yml");
    const staging = await readWorkflow(".github/workflows/deploy-staging.yml");
    const production = await readWorkflow(".github/workflows/deploy-production.yml");

    expect(development).toContain("environment: development");
    expect(development).toContain("branches-ignore: [main]");
    expect(staging).toContain("environment: staging");
    expect(staging).toContain("branches: [main]");
    expect(production).toContain("environment: production");
    expect(production).toContain("types: [published]");
  });
});
