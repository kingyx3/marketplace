import { readdir, readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

async function repoFile(path: string): Promise<string> {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

describe("deployment idempotency contract", () => {
  it("serializes shared infrastructure and target deployments", async () => {
    for (const path of [
      ".github/workflows/terraform-state-bootstrap.yml",
      ".github/workflows/terraform-platform.yml",
    ]) {
      const workflow = await repoFile(path);
      expect(workflow).toContain("group: marketplace-shared-infrastructure");
      expect(workflow).toContain("cancel-in-progress: false");
    }

    expect(await repoFile(".github/workflows/bootstrap-environment.yml")).toContain(
      "group: marketplace-environment-${{ inputs.environment }}"
    );
    const deployApp = await repoFile(".github/workflows/deploy-app.yml");
    expect(deployApp).toContain(
      "group: marketplace-deploy-${{ inputs.target || github.ref_name || github.event_name }}"
    );
    expect(deployApp).toContain("cancel-in-progress: ${{ github.event_name == 'push'");
    expect(deployApp).toContain("startsWith(github.ref, 'refs/heads/')");
    expect(deployApp).toContain("github.ref != 'refs/heads/main'");
  });

  it("uses one convergent infrastructure path and applies the exact generated plan", async () => {
    for (const path of [
      ".github/workflows/terraform-state-bootstrap.yml",
      ".github/workflows/terraform-platform.yml",
    ]) {
      const workflow = await repoFile(path);
      expect(workflow).toContain("  converge:");
      expect(workflow).not.toContain("workflow_dispatch:");
      expect(workflow).not.toContain("plan_run_id");
      expect(workflow).toContain('plan="$RUNNER_TEMP/');
      expect(workflow).toContain('apply -input=false -auto-approve "$plan"');
    }
  });

  it("keeps only one code-change deployment workflow", async () => {
    const workflowsDirectory = new URL("../.github/workflows/", import.meta.url);
    const workflowNames = (await readdir(workflowsDirectory)).filter((name) =>
      /\.ya?ml$/.test(name)
    );
    expect(workflowNames).toContain("deploy-app.yml");
    expect(workflowNames).not.toContain("deploy-development.yml");
    expect(workflowNames).not.toContain("deploy-staging.yml");
    expect(workflowNames).not.toContain("deploy-production.yml");
  });

  it("turns unchanged Vercel configuration and deployments into no-ops", async () => {
    const sync = await repoFile("scripts/sync-vercel-env.mjs");
    const deploy = await repoFile("scripts/deploy-vercel.mjs");
    expect(sync).toContain("fetchVercelEnvironmentRecords");
    expect(sync).toContain("updateVercelEnvironmentRecord");
    expect(sync).toContain("currentFingerprint === desiredFingerprint");
    expect(sync).toContain("unchanged += 1");
    expect(sync).not.toContain("scripts/fingerprint-runtime-env.mjs");
    expect(deploy).toContain("marketplaceDeploymentKey");
    expect(deploy).toContain("Reusing ready ${targetEnv} Vercel deployment");
    expect(deploy).toContain(
      'const target = targetEnv === "development" ? "preview" : "production"'
    );
    expect(deploy).toContain('"--build-env"');
    expect(deploy).toContain("`NEXT_PUBLIC_SENTRY_ENVIRONMENT=${targetEnv}`");
    expect(deploy).toContain('"--env"');
  });

  it("derives non-secret HitPay configuration from versioned defaults", async () => {
    const hitpay = await repoFile("lib/hitpay.ts");
    const webhook = await repoFile("scripts/lib/hitpay-webhook.mjs");
    const bootstrap = await repoFile("scripts/bootstrap-github.mjs");
    const config = JSON.parse(await repoFile("config/environments.json"));

    expect(hitpay).toContain('env.TARGET_ENV === "production"');
    expect(hitpay).toContain('env.HITPAY_PAYMENT_METHODS || "paynow_online"');
    expect(webhook).toContain('webhookName: `${appName} ${targetEnv} payments`');
    expect(webhook).toContain('"payment_request.completed"');
    expect(config.shared.HITPAY_API_URL).toBe("https://api.sandbox.hit-pay.com");
    expect(config.environments.production.HITPAY_API_URL).toBe("https://api.hit-pay.com");
    expect(config.shared).not.toHaveProperty("HITPAY_WEBHOOK_ENABLED_EVENTS");

    const commonVariables = bootstrap.slice(
      bootstrap.indexOf("const commonVariables = ["),
      bootstrap.indexOf("];", bootstrap.indexOf("const commonVariables = [")) + 2
    );
    expect(commonVariables).not.toContain("HITPAY_API_URL");
    expect(commonVariables).not.toContain("HITPAY_PAYMENT_METHODS");
    expect(commonVariables).not.toContain("HITPAY_WEBHOOK_ID");
    expect(commonVariables).not.toContain("HITPAY_WEBHOOK_ENABLED_EVENTS");
    expect(bootstrap).toContain('"HITPAY_WEBHOOK_ID",');
    expect(bootstrap).toContain('"HITPAY_WEBHOOK_ENABLED_EVENTS",');
    expect(bootstrap).toContain('deleteEnvironmentSettingIfPresent("variable", environment, legacy)');
  });
});
