import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

async function repoFile(path: string): Promise<string> {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

describe("deployment idempotency contract", () => {
  it("uses a global lock for shared infrastructure and per-environment runtime locks", async () => {
    for (const path of [
      ".github/workflows/terraform-state-bootstrap.yml",
      ".github/workflows/terraform-platform.yml",
    ]) {
      const workflow = await repoFile(path);
      expect(workflow).toContain("group: marketplace-shared-infrastructure");
      expect(workflow).toContain("cancel-in-progress: false");
    }
    for (const path of [
      ".github/workflows/configure-providers.yml",
      ".github/workflows/bootstrap-environment.yml",
    ]) {
      const workflow = await repoFile(path);
      expect(workflow).toContain("group: marketplace-environment-${{ inputs.environment }}");
    }
    expect(await repoFile(".github/workflows/deploy-development.yml")).toContain("group: marketplace-environment-development");
    expect(await repoFile(".github/workflows/deploy-staging.yml")).toContain("group: marketplace-environment-staging");
    expect(await repoFile(".github/workflows/deploy-production.yml")).toContain("group: marketplace-environment-production");
  });

  it("keeps granular plan mode read-only and applies an exact reviewed artifact", async () => {
    for (const path of [
      ".github/workflows/terraform-state-bootstrap.yml",
      ".github/workflows/terraform-platform.yml",
    ]) {
      const workflow = await repoFile(path);
      const planSection = workflow.slice(workflow.indexOf("  plan:"), workflow.indexOf("  apply:"));
      expect(planSection).not.toContain("bootstrap-terraform");
      expect(planSection).not.toContain("terraform state rm");
      expect(workflow).toMatch(/actions\/upload-artifact@v\d/);
      expect(workflow).toMatch(/actions\/download-artifact@v\d/);
      expect(workflow).toContain("plan_run_id");
      expect(workflow).toContain("source_sha");
    }
  });

  it("turns unchanged Vercel configuration and deployments into no-ops", async () => {
    const sync = await repoFile("scripts/sync-vercel-env.mjs");
    const deploy = await repoFile("scripts/deploy-vercel.mjs");
    expect(sync).toContain("scripts/fingerprint-runtime-env.mjs");
    expect(sync).toContain('"env", "update"');
    expect(sync).toContain("unchanged += 1");
    expect(deploy).toContain("marketplaceDeploymentKey");
    expect(deploy).toContain("Reusing ready ${targetEnv} Vercel deployment");
    expect(deploy).toContain('const target = targetEnv === "development" ? "preview" : "production"');
  });

  it("keeps Stripe checkout and webhooks limited to PayNow lifecycle events", async () => {
    const stripe = await repoFile("lib/stripe.ts");
    const config = JSON.parse(await repoFile("config/environments.json"));
    expect(stripe).toContain('normalized.payment_method_types = ["paynow"]');
    expect(stripe).toContain("delete normalized.automatic_payment_methods");
    expect(config.shared.STRIPE_WEBHOOK_ENABLED_EVENTS).toEqual([
      "payment_intent.succeeded",
      "payment_intent.payment_failed",
      "charge.refunded",
    ]);
  });
});
