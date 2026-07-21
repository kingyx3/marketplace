import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

describe("development deployment runtime refresh", () => {
  it("never reuses a development deployment after runtime environment reconciliation", async () => {
    const deployment = await read("scripts/deploy-vercel.mjs");

    expect(deployment).toContain('const reuseEnabled = targetEnv !== "development";');
    expect(deployment).toContain(
      "const existing = reuseEnabled ? await findReadyDeployment(deploymentKey) : null;"
    );
    expect(deployment).toContain(
      "Creating a fresh development Vercel deployment so reconciled runtime environment changes are applied."
    );
  });

  it("keeps Supabase key validation before every environment deployment", async () => {
    const workflow = await read(".github/workflows/deploy.yml");

    expect(workflow).toContain(
      'SUPABASE_SECRET_KEY: ${{ secrets.SUPABASE_SECRET_KEY || secrets.SUPABASE_SERVICE_ROLE_KEY }}'
    );
    expect(workflow).toContain("--verify-supabase-keys");
    expect(workflow.indexOf("--verify-supabase-keys")).toBeLessThan(
      workflow.indexOf("node scripts/deploy-vercel.mjs")
    );
  });

  it("leaves releases as the direct production trigger when staging topology is disabled", async () => {
    const workflow = await read(".github/workflows/deploy-app.yml");
    const directProduction = workflow.slice(workflow.indexOf("  deploy-production-direct:"));

    expect(directProduction).toContain("vars.ENABLE_RELEASE_TOPOLOGY != 'true'");
    expect(directProduction).toContain("github.event_name == 'release'");
    expect(directProduction).toContain("startsWith(github.ref, 'refs/tags/v')");
    expect(directProduction).not.toContain("github.ref == 'refs/heads/main'");
  });
});
