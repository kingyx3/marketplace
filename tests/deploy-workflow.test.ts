import { readdir, readFile } from "node:fs/promises";
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

  it("scopes every workflow job that reads GitHub vars or secrets to an environment", async () => {
    const workflowsDirectory = new URL("../.github/workflows/", import.meta.url);
    const workflowNames = (await readdir(workflowsDirectory)).filter((name) => /\.ya?ml$/.test(name));
    const violations: string[] = [];

    for (const workflowName of workflowNames) {
      const workflow = await readFile(new URL(workflowName, workflowsDirectory), "utf8");
      const lines = workflow.split("\n");
      const jobsIndex = lines.findIndex((line) => line === "jobs:");
      if (jobsIndex === -1) continue;

      const jobs: Array<{ name: string; body: string }> = [];
      let current: { name: string; lines: string[] } | undefined;

      for (const line of lines.slice(jobsIndex + 1)) {
        const match = line.match(/^  ([A-Za-z0-9_-]+):\s*$/);
        if (match) {
          if (current) jobs.push({ name: current.name, body: current.lines.join("\n") });
          current = { name: match[1]!, lines: [line] };
        } else if (current) {
          current.lines.push(line);
        }
      }
      if (current) jobs.push({ name: current.name, body: current.lines.join("\n") });

      const sensitiveAnchors = new Set<string>();
      for (const job of jobs) {
        const anchor = job.body.match(/^    env:\s*&([A-Za-z0-9_-]+)\s*$/m)?.[1];
        if (anchor && /\$\{\{\s*(?:vars|secrets)(?:\.|\[)/.test(job.body)) {
          sensitiveAnchors.add(anchor);
        }
      }

      for (const job of jobs) {
        const directlyReadsGitHubValues = /\$\{\{\s*(?:vars|secrets)(?:\.|\[)/.test(job.body);
        const referencedAnchors = [...job.body.matchAll(/^    env:\s*\*([A-Za-z0-9_-]+)\s*$/gm)].map(
          (match) => match[1]!,
        );
        const readsGitHubValues =
          directlyReadsGitHubValues || referencedAnchors.some((anchor) => sensitiveAnchors.has(anchor));

        if (readsGitHubValues && !/^    environment:/m.test(job.body)) {
          violations.push(`${workflowName}:${job.name}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it("exposes two deployment orchestrators and hides their reusable helpers", async () => {
    const workflowsDirectory = new URL("../.github/workflows/", import.meta.url);
    const workflowNames = (await readdir(workflowsDirectory)).filter((name) => /\.ya?ml$/.test(name));
    const workflows = await Promise.all(
      workflowNames.map(async (file) => ({ file, content: await readFile(new URL(file, workflowsDirectory), "utf8") })),
    );
    const names = workflows.map(({ content }) => content.match(/^name:\s*(.+)$/m)?.[1]);

    expect(names).toContain("Bootstrap & Deploy");
    expect(names).toContain("Deploy App");
    expect(names).toContain("CI");
    expect(names).toContain("Configure Providers (recovery)");

    const helpers = [
      "app-checks.yml",
      "bootstrap-environment.yml",
      "deploy.yml",
      "hosted-release-gates.yml",
      "terraform-platform.yml",
      "terraform-state-bootstrap.yml",
    ];
    for (const helper of helpers) {
      const workflow = workflows.find(({ file }) => file === helper)?.content;
      expect(workflow).toBeDefined();
      expect(workflow).toMatch(/^name:\s*ZZZ-/m);
      expect(workflow).toContain("workflow_call:");
      expect(workflow).not.toContain("workflow_dispatch:");
    }

    for (const removed of ["deploy-development.yml", "deploy-staging.yml", "deploy-production.yml"]) {
      expect(workflowNames).not.toContain(removed);
    }
  });

  it("defaults full-stack bootstrap to development while guarding optional staging", async () => {
    const workflow = await read(".github/workflows/bootstrap.yml");
    expect(workflow).toContain("name: Bootstrap & Deploy");
    expect(workflow).toContain("default: development");
    expect(workflow).toContain("options: [development, staging, production]");
    expect(workflow).toContain("ENABLE_RELEASE_TOPOLOGY");
    expect(workflow).toContain("uses: ./.github/workflows/terraform-state-bootstrap.yml");
    expect(workflow).toContain("uses: ./.github/workflows/terraform-platform.yml");
    expect(workflow).toContain("uses: ./.github/workflows/bootstrap-environment.yml");
    expect(workflow).toContain("uses: ./.github/workflows/deploy.yml");
    expect(workflow).toContain("mode: verify");
    expect(workflow).toContain("skip_app_checks: true");
  });

  it("routes code changes and releases through one deployment orchestrator", async () => {
    const workflow = await read(".github/workflows/deploy-app.yml");
    expect(workflow).toContain("name: Deploy App");
    expect(workflow).toContain("branches: [develop, main]");
    expect(workflow).toContain("tags: ['v*']");
    expect(workflow).toContain("types: [published]");
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("environment: development");
    expect(workflow).toContain("environment: staging");
    expect(workflow).toContain("environment: production");
    expect(workflow).toContain("deploy-release-staging:");
    expect(workflow).toContain("hosted-release-gates:");
    expect(workflow).toContain("needs: deploy-release-staging");
    expect(workflow).toContain("staging_app_url: ${{ needs.deploy-release-staging.outputs.deployment_url }}");
    expect(workflow).toContain("deploy-production:");
    expect(workflow).toContain("needs: hosted-release-gates");
  });

  it("keeps infrastructure helpers convergent and reusable-only", async () => {
    const state = await read(".github/workflows/terraform-state-bootstrap.yml");
    const platform = await read(".github/workflows/terraform-platform.yml");
    for (const workflow of [state, platform]) {
      expect(workflow).toContain("workflow_call:");
      expect(workflow).not.toContain("workflow_dispatch:");
      expect(workflow).toContain("  converge:");
      expect(workflow).not.toContain("  reconcile:");
      expect(workflow).not.toContain("  plan:");
      expect(workflow).not.toContain("  apply:");
      expect(workflow).toContain("-lockfile=readonly");
      expect(workflow).toContain("apply -input=false -auto-approve");
    }
  });

  it("runs the shared runtime reconciler before deployment", async () => {
    const workflow = await read(".github/workflows/deploy.yml");
    expect(workflow).toContain("node scripts/reconcile-runtime-environment.mjs --providers apply-if-configured");
    expect(workflow).toContain("node scripts/deploy-vercel.mjs");
    expect(workflow.indexOf("reconcile-runtime-environment.mjs")).toBeLessThan(workflow.indexOf("deploy-vercel.mjs"));
    expect(workflow).toContain("node scripts/generate-env.mjs --check --allow-missing-provisioned");
  });

  it("blocks staging and production deploys when live state drifts", async () => {
    const workflow = await read(".github/workflows/deploy.yml");
    expect(workflow).toContain("Enforce hosted infrastructure and provider readiness");
    expect(workflow).toContain("if: ${{ inputs.environment != 'development' }}");
    expect(workflow).toContain("node scripts/verify-environment.mjs --skip-health");
    expect(workflow.indexOf("verify-environment.mjs --skip-health")).toBeLessThan(
      workflow.indexOf("Link and push hosted migrations"),
    );
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

  it("provides a credentialed non-mutating readiness gate through bootstrap", async () => {
    const bootstrap = await read(".github/workflows/bootstrap-environment.yml");
    const verifier = await read("scripts/verify-environment.mjs");
    const sync = await read("scripts/sync-vercel-env.mjs");
    expect(bootstrap).toContain("workflow_call:");
    expect(bootstrap).not.toContain("workflow_dispatch:");
    expect(bootstrap).toContain("if: inputs.mode == 'verify'");
    expect(bootstrap).toContain("node scripts/verify-environment.mjs");
    expect(verifier).toContain("-detailed-exitcode");
    expect(verifier).toContain("configure-providers.mjs");
    expect(sync).toContain("--check-only");
    expect(sync).toContain("Vercel runtime drift detected");
  });
});
