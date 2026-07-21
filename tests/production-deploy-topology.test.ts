import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

describe("deployment topology", () => {
  it("deploys non-main branches to development through the checked deployment workflow", async () => {
    const [orchestrator, deployment] = await Promise.all([
      read(".github/workflows/deploy-app.yml"),
      read(".github/workflows/deploy.yml"),
    ]);

    expect(orchestrator).toContain("github.ref != 'refs/heads/main'");
    expect(orchestrator).toContain("  deploy-development:");
    expect(orchestrator).toContain("environment: development");
    expect(orchestrator).toContain("uses: ./.github/workflows/deploy.yml");
    expect(deployment).toContain("uses: ./.github/workflows/app-checks.yml");
    expect(deployment).toContain("Deep readiness check");
  });

  it("does not deploy main while staging topology is disabled", async () => {
    const workflow = await read(".github/workflows/deploy-app.yml");

    expect(workflow).toContain("Staging is not provisioned; the main revision was not deployed.");
    const directProductionJob = workflow.slice(workflow.indexOf("  deploy-production-direct:"));
    expect(directProductionJob).not.toContain("refs/heads/main");
  });

  it("deploys published releases to production through the checked deployment workflow", async () => {
    const [orchestrator, deployment] = await Promise.all([
      read(".github/workflows/deploy-app.yml"),
      read(".github/workflows/deploy.yml"),
    ]);
    const directProductionJob = orchestrator.slice(
      orchestrator.indexOf("  deploy-production-direct:")
    );

    expect(orchestrator).toContain("release:\n    types: [published]");
    expect(directProductionJob).toContain("github.event_name == 'release'");
    expect(directProductionJob).toContain("environment: production");
    expect(deployment).toContain("node scripts/resolve-environment.mjs");
    expect(deployment).toContain("node scripts/reconcile-runtime-environment.mjs");
    expect(deployment).toContain("node scripts/check-deployment-health.mjs");
  });
});
