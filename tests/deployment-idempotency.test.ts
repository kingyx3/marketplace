import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

async function repoFile(path: string): Promise<string> {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

describe("deployment idempotency contract", () => {
  it("serializes every workflow that mutates a hosted environment", async () => {
    const dynamicWorkflows = await Promise.all(
      [
        ".github/workflows/terraform-state-bootstrap.yml",
        ".github/workflows/terraform-platform.yml",
        ".github/workflows/configure-providers.yml",
        ".github/workflows/bootstrap-environment.yml",
      ].map(repoFile)
    );

    for (const workflow of dynamicWorkflows) {
      expect(workflow).toContain("group: environment-${{ inputs.environment }}");
      expect(workflow).toContain("cancel-in-progress: false");
    }

    const development = await repoFile(".github/workflows/deploy-development.yml");
    const production = await repoFile(".github/workflows/deploy-production.yml");
    expect(development).toContain("group: environment-development");
    expect(development).toContain("cancel-in-progress: false");
    expect(production).toContain("group: environment-production");
    expect(production).toContain("cancel-in-progress: false");
  });

  it("reconciles Terraform state explicitly instead of hiding import failures", async () => {
    const workflow = await repoFile(".github/workflows/terraform-state-bootstrap.yml");
    const bootstrap = await repoFile("scripts/bootstrap-terraform-state-import.mjs");

    expect(workflow).toContain("node scripts/bootstrap-terraform-state-import.mjs");
    expect(workflow).not.toContain("terraform import google_storage_bucket.terraform_state");
    expect(workflow).not.toContain("|| true");
    expect(bootstrap).toContain("isMissingRemoteObject");
    expect(bootstrap).toContain("is already managed in Terraform state; skipping import");
  });

  it("turns unchanged Vercel configuration and deployments into no-ops", async () => {
    const sync = await repoFile("scripts/sync-vercel-env.mjs");
    const deploy = await repoFile("scripts/deploy-vercel.mjs");

    expect(sync).toContain("scripts/fingerprint-runtime-env.mjs");
    expect(sync).toContain('"env", "update"');
    expect(sync).toContain("unchanged += 1");
    expect(sync).toContain("VERCEL_DEPLOYMENT_CONFIG_FINGERPRINT");
    expect(deploy).toContain("marketplaceDeploymentKey");
    expect(deploy).toContain("findReadyDeployment");
    expect(deploy).toContain("Reusing ready Vercel deployment");
  });

  it("keeps Stripe checkout and webhooks limited to PayNow lifecycle events", async () => {
    const stripe = await repoFile("lib/stripe.ts");
    const config = JSON.parse(await repoFile("config/environments.json"));

    expect(stripe).toContain('normalized.payment_method_types = ["paynow"]');
    expect(stripe).toContain("delete normalized.automatic_payment_methods");
    expect(stripe).toContain("delete normalized.capture_method");
    expect(stripe).toContain("delete normalized.setup_future_usage");
    expect(config.shared.STRIPE_WEBHOOK_ENABLED_EVENTS).toEqual([
      "payment_intent.succeeded",
      "payment_intent.payment_failed",
      "charge.refunded",
    ]);
  });
});
