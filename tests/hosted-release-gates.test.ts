import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("hosted production release gates", () => {
  it("deploys the exact release commit to staging before production", async () => {
    const workflow = await readFile(
      new URL("../.github/workflows/deploy-app.yml", import.meta.url),
      "utf8",
    );

    expect(workflow).toContain("deploy-release-staging:");
    expect(workflow).toContain("environment: staging");
    expect(workflow).toContain("hosted-release-gates:");
    expect(workflow).toContain("needs: deploy-release-staging");
    expect(workflow).toContain(
      "staging_app_url: ${{ needs.deploy-release-staging.outputs.deployment_url }}",
    );
    expect(workflow).toContain("deploy-production:");
    expect(workflow).toContain("needs: hosted-release-gates");
  });

  it("requires real hosted identity, Stripe, restore, alert, and provider evidence", async () => {
    const workflow = await readFile(
      new URL("../.github/workflows/hosted-release-gates.yml", import.meta.url),
      "utf8",
    );

    expect(workflow).toContain("name: ZZZ-Hosted Release Gates");
    expect(workflow).toContain("workflow_call:");
    expect(workflow).not.toContain("workflow_dispatch:");
    for (const command of [
      "verify-hosted-supabase.mjs",
      "verify-stripe-staging.mjs",
      "verify-hosted-operations.mjs",
      "verify-hosted-restore.sh",
      "verify-supabase-provider-readiness.mjs",
    ]) {
      expect(workflow).toContain(command);
    }
    expect(workflow).toContain("environment: staging");
    expect(workflow).toContain("environment: production");
    expect(workflow).toContain("RESTORE_DRILL_ALLOW_DESTRUCTIVE: I_UNDERSTAND");
    expect(workflow).toContain("SUPABASE_REQUIRED_BACKUP_MODE: pitr");
  });

  it("keeps isolated staging and recovery infrastructure available as an opt-in topology", async () => {
    const terraform = await readFile(
      new URL("../infra/terraform/platform/main.tf", import.meta.url),
      "utf8",
    );
    const outputs = await readFile(
      new URL("../infra/terraform/platform/outputs.tf", import.meta.url),
      "utf8",
    );
    const variables = await readFile(
      new URL("../infra/terraform/platform/variables.tf", import.meta.url),
      "utf8",
    );

    expect(terraform).toContain('toset(["staging", "recovery"])');
    expect(terraform).toContain('resource "vercel_project" "staging"');
    expect(terraform).toContain("count = var.enable_release_topology ? 1 : 0");
    expect(outputs).toContain('output "vercel_project_ids"');
    expect(outputs).toContain('{ for project in vercel_project.staging : "staging" => project.id }');
    expect(variables).toContain('variable "enable_release_topology"');
    expect(variables).toContain("default     = false");
  });

  it("keeps the restore target explicitly destructive and separate", async () => {
    const script = await readFile(
      new URL("../scripts/verify-hosted-restore.sh", import.meta.url),
      "utf8",
    );

    expect(script).toContain("RESTORE_DRILL_ALLOW_DESTRUCTIVE");
    expect(script).toContain("Staging and recovery project refs must differ");
    expect(script).toContain("--clean");
    expect(script).toContain("RESTORE_RTO_SECONDS");
    expect(script).toContain("restore marker was not recovered");
  });
});
