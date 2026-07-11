import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

describe("deployment workflow contract", () => {
  it("shares one quality-check workflow between CI and deployment", async () => {
    const ci = await read(".github/workflows/ci.yml");
    const deploy = await read(".github/workflows/deploy.yml");
    const checks = await read(".github/workflows/app-checks.yml");
    expect(ci).toContain("uses: ./.github/workflows/app-checks.yml");
    expect(deploy).toContain("uses: ./.github/workflows/app-checks.yml");
    expect(deploy).toContain("skip_app_checks:");
    for (const command of ["npm run lint", "npm run typecheck", "npm test", "npm run build"]) {
      expect(checks).toContain(command);
    }
  });

  it("defaults hosted bootstrap to development with explicit staging and production", async () => {
    const workflow = await read(".github/workflows/bootstrap.yml");
    expect(workflow).toContain("name: Bootstrap & Deploy");
    expect(workflow).toContain("default: development");
    expect(workflow).toContain("options: [development, staging, production]");
    expect(workflow).not.toContain("options: [all");
    expect(workflow).toContain("environment: ${{ inputs.target }}");
    expect(workflow).toContain("uses: ./.github/workflows/terraform-state-bootstrap.yml");
    expect(workflow).toContain("uses: ./.github/workflows/terraform-platform.yml");
    expect(workflow).toContain("uses: ./.github/workflows/bootstrap-environment.yml");
    expect(workflow).toContain("uses: ./.github/workflows/deploy.yml");
    expect(workflow).toContain("mode: converge");
    expect(workflow).toContain("mode: verify");
    expect(workflow).toContain("skip_app_checks: true");
    expect(workflow).not.toContain("bootstrap-development:");
    expect(workflow).not.toContain("bootstrap-production:");
  });

  it("keeps granular Terraform workflows reusable while defaulting to convergence", async () => {
    const state = await read(".github/workflows/terraform-state-bootstrap.yml");
    const platform = await read(".github/workflows/terraform-platform.yml");
    for (const workflow of [state, platform]) {
      expect(workflow).toContain("workflow_call:");
      expect(workflow).toContain("default: converge");
      expect(workflow).toContain("options: [converge, reconcile, plan, apply]");
      expect(workflow).toContain("if: inputs.mode == 'converge'");
      expect(workflow).toContain("-lockfile=readonly");
    }
    expect(state).toContain("apply -input=false -auto-approve \"$plan\"");
    expect(platform).toContain("apply -input=false -auto-approve \"$plan\"");
  });

  it("runs the shared runtime reconciler before deployment", async () => {
    const workflow = await read(".github/workflows/deploy.yml");
    expect(workflow).toContain("node scripts/reconcile-runtime-environment.mjs --providers apply-if-configured");
    expect(workflow).toContain("node scripts/deploy-vercel.mjs");
    expect(workflow.indexOf("reconcile-runtime-environment.mjs")).toBeLessThan(workflow.indexOf("deploy-vercel.mjs"));
    expect(workflow).toContain("node scripts/generate-env.mjs --check --allow-missing-provisioned");
  });

  it("blocks staging and production deploys when live infrastructure or provider state drifts", async () => {
    const workflow = await read(".github/workflows/deploy.yml");
    expect(workflow).toContain("Enforce hosted infrastructure and provider readiness");
    expect(workflow).toContain("if: ${{ inputs.environment != 'development' }}");
    expect(workflow).toContain("node scripts/verify-environment.mjs --skip-health");
    expect(workflow.indexOf("verify-environment.mjs --skip-health")).toBeLessThan(workflow.indexOf("Link and push hosted migrations"));
  });

  it("gates production on an exact staging deployment and hosted evidence", async () => {
    const workflow = await read(".github/workflows/deploy-production.yml");
    expect(workflow).toContain("deploy-staging:");
    expect(workflow).toContain("environment: staging");
    expect(workflow).toContain("hosted-release-gates:");
    expect(workflow).toContain("needs: deploy-staging");
    expect(workflow).toContain("staging_app_url: ${{ needs.deploy-staging.outputs.deployment_url }}");
    expect(workflow).toContain("deploy-production:");
    expect(workflow).toContain("needs: hosted-release-gates");
  });

  it("uses one integration branch for the shared development data environment", async () => {
    const development = await read(".github/workflows/deploy-development.yml");
    expect(development).toContain("branches: [develop]");
    expect(development).toContain("workflow_dispatch:");
    expect(development).not.toContain("branches-ignore: [main]");
  });

  it("uses pinned operational tool versions and committed lockfiles", async () => {
    const deployment = await read(".github/workflows/deploy.yml");
    const platform = await read(".github/workflows/terraform-platform.yml");
    const state = await read(".github/workflows/terraform-state-bootstrap.yml");
    expect(deployment).toContain("terraform_version: 1.15.8");
    expect(deployment).toContain("-lockfile=readonly");
    expect(deployment).toContain("supabaseCli");
    expect(platform).toContain("terraform_version: 1.15.8");
    expect(state).toContain("terraform_version: 1.15.8");
  });

  it("provides a credentialed non-mutating readiness gate", async () => {
    const bootstrap = await read(".github/workflows/bootstrap-environment.yml");
    const verifier = await read("scripts/verify-environment.mjs");
    const sync = await read("scripts/sync-vercel-env.mjs");
    expect(bootstrap).toContain("workflow_call:");
    expect(bootstrap).toContain("options: [apply, verify]");
    expect(bootstrap).toContain("if: inputs.mode == 'verify'");
    expect(bootstrap).toContain("node scripts/verify-environment.mjs");
    expect(verifier).toContain("-detailed-exitcode");
    expect(verifier).toContain("configure-providers.mjs");
    expect(sync).toContain("--check-only");
    expect(sync).toContain("Vercel runtime drift detected");
  });
});
