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

  it("defaults hosted bootstrap to development while guarding the optional staging target", async () => {
    const workflow = await read(".github/workflows/bootstrap.yml");
    expect(workflow).toContain("name: Bootstrap & Deploy");
    expect(workflow).toContain("default: development");
    expect(workflow).toContain("options: [development, staging, production]");
    expect(workflow).not.toContain("options: [all");
    expect(workflow).toContain("validate-target:");
    expect(workflow).toContain("ENABLE_RELEASE_TOPOLOGY");
    expect(workflow).toContain("inputs.target == 'staging'");
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

  it("keeps operator documentation aligned with bootstrap and platform contracts", async () => {
    const [bootstrap, deployment, architecture, platformDocs, platform, variables, packageJson] = await Promise.all([
      read("docs/bootstrap.md"),
      read("docs/deployment.md"),
      read("docs/architecture.md"),
      read("infra/terraform/platform/README.md"),
      read("infra/terraform/platform/main.tf"),
      read("infra/terraform/platform/variables.tf"),
      read("package.json"),
    ]);
    const nextVersion = JSON.parse(packageJson).dependencies.next as string;
    const nextMajor = nextVersion.match(/\d+/)?.[0];

    for (const target of ["development", "staging", "production"]) {
      expect(bootstrap).toContain(`\`${target}\``);
    }
    expect(bootstrap).toContain("ENABLE_RELEASE_TOPOLOGY");
    expect(bootstrap).toContain("npm run bootstrap -- --apply --target=staging");
    expect(bootstrap).toContain("npm run bootstrap -- --apply --target=production");
    expect(deployment).toContain("Pushes to `main` deploy `staging`");
    expect(platform).toContain("base_supabase_environments");
    expect(platform).toContain("release_supabase_environments = var.enable_release_topology");
    expect(variables).toContain('variable "enable_release_topology"');
    expect(variables).toContain("default     = false");
    expect(platformDocs).toContain("The default compact topology is");
    expect(platformDocs).toContain("ENABLE_RELEASE_TOPOLOGY=true");
    expect(architecture).toContain(`Next.js ${nextMajor}`);
  });

  it("keeps the release topology disabled by default and restorable without address changes", async () => {
    const [platform, outputs, resolver, imports, workflow, bootstrapGithub] = await Promise.all([
      read("infra/terraform/platform/main.tf"),
      read("infra/terraform/platform/outputs.tf"),
      read("scripts/resolve-terraform-inputs.mjs"),
      read("scripts/bootstrap-terraform-imports.mjs"),
      read(".github/workflows/terraform-platform.yml"),
      read("scripts/bootstrap-github.mjs"),
    ]);
    expect(platform).toContain("base_supabase_environments");
    expect(platform).toContain('toset(["staging", "recovery"])');
    expect(platform).toContain("count = var.enable_release_topology ? 1 : 0");
    expect(outputs).toContain('{ for project in vercel_project.staging : "staging" => project.id }');
    expect(outputs).toContain('output "release_topology_enabled"');
    expect(workflow).toContain("ENABLE_RELEASE_TOPOLOGY: ${{ vars.ENABLE_RELEASE_TOPOLOGY }}");
    expect(resolver).toContain("TF_VAR_enable_release_topology");
    expect(resolver).toContain('"development,production"');
    expect(resolver).toContain('"development,staging,recovery,production"');
    expect(imports).toContain("releaseTopologyEnabled");
    expect(imports).toContain("vercel_project.staging[0]");
    expect(bootstrapGithub).toContain("ENABLE_RELEASE_TOPOLOGY");
    expect(bootstrapGithub).toContain("setRepositoryVariable");
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
