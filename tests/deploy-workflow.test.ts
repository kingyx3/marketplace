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
    expect(workflow).toContain("TARGET_ENV:");
    expect(workflow).toContain("Resolve Terraform backend inputs");
    expect(workflow).toContain("terraform output -json > tf-outputs.json");
    expect(workflow).toContain("node scripts/resolve-environment.mjs");
    expect(workflow).toContain("Validate resolved environment contract before provider provisioning");
    expect(workflow).toContain("node scripts/generate-env.mjs --check --allow-missing-provisioned");
    expect(workflow).toContain("Reconcile Stripe webhook before runtime validation");
    expect(workflow).toContain("vercel env run --environment");
    expect(workflow).toContain("node scripts/provision-stripe-webhook.mjs");
    expect(workflow.indexOf("node scripts/provision-stripe-webhook.mjs")).toBeLessThan(
      workflow.indexOf("node scripts/generate-env.mjs --write .env.deploy")
    );
    expect(workflow).toContain("Generate runtime env from resolved config");
    expect(workflow).toContain("node scripts/generate-env.mjs --write .env.deploy");
    expect(workflow).toContain("Sync runtime env to Vercel");
    expect(workflow).toContain("node scripts/sync-vercel-env.mjs .env.deploy");
    expect(workflow).toContain("node scripts/deploy-vercel.mjs");
    expect(workflow).toContain("Remove generated runtime env");
    expect(workflow).toContain("if: always()");
    expect(workflow).toContain("rm -f .env.deploy");
    expect(workflow).toContain("NEXT_PUBLIC_SITE_URL: ${{ vars.NEXT_PUBLIC_SITE_URL }}");
    expect(workflow).toContain("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: ${{ vars.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY }}");
    expect(workflow).toContain("GOOGLE_OAUTH_CLIENT_ID: ${{ vars.GOOGLE_OAUTH_CLIENT_ID }}");
    expect(workflow).not.toContain("vars.SUPABASE_PROJECT_REF");
    expect(workflow).not.toContain("SUPABASE_DB_PASSWORD: ${{ secrets['SUPABASE_DB_PASSWORD'] }}");
    expect(workflow).not.toContain("npx vercel pull");
    expect(workflow).toContain("Deep readiness check");
    expect(workflow).toContain("$URL/api/health?deep=1");
  });

  it("maps deployment callers to the active GitHub Environments", async () => {
    const development = await readWorkflow(".github/workflows/deploy-development.yml");
    const production = await readWorkflow(".github/workflows/deploy-production.yml");

    expect(development).toContain("deploy-ready:");
    expect(development).toContain("Check development deploy prerequisites");
    expect(development).toContain("environment: development");
    expect(development).toContain("branches-ignore: [main]");
    expect(development).toContain("GCP_TERRAFORM_CREDENTIALS_JSON");
    expect(development).toContain("SUPABASE_ACCESS_TOKEN");
    expect(development).not.toContain("config-ready");
    expect(development).not.toContain("config/environments.json");
    expect(production).toContain("environment: production");
    expect(production).toContain("types: [published]");
  });

  it("keeps bootstrap separate from regular deployment", async () => {
    const bootstrap = await readWorkflow(".github/workflows/bootstrap-environment.yml");

    expect(bootstrap).toContain("workflow_dispatch:");
    expect(bootstrap).toContain("type: environment");
    expect(bootstrap).toContain("environment: ${{ inputs.environment }}");
    expect(bootstrap).toContain("supabase/setup-cli@v1");
    expect(bootstrap).toContain("node scripts/bootstrap-environment.mjs");
    expect(bootstrap).not.toContain("uses: ./.github/workflows/deploy.yml");
    expect(bootstrap).not.toContain("npx vercel deploy");
  });

  it("runs Terraform through the input resolver and import bootstrap", async () => {
    const stateBootstrap = await readWorkflow(".github/workflows/terraform-state-bootstrap.yml");
    const platform = await readWorkflow(".github/workflows/terraform-platform.yml");

    expect(stateBootstrap).toContain("type: environment");
    expect(stateBootstrap).toContain("environment: ${{ inputs.environment }}");
    expect(stateBootstrap).toContain("node scripts/resolve-terraform-inputs.mjs state");
    expect(platform).toContain("type: environment");
    expect(platform).toContain("environment: ${{ inputs.environment }}");
    expect(platform).toContain("node scripts/resolve-terraform-inputs.mjs platform");
    expect(platform).toContain("node scripts/bootstrap-terraform-imports.mjs");
    expect(platform.indexOf("node scripts/bootstrap-terraform-imports.mjs")).toBeLessThan(platform.indexOf("terraform plan -out=tfplan"));
    expect(platform).not.toContain("SUPABASE_DEVELOPMENT_DB_PASSWORD");
    expect(platform).not.toContain("TF_VAR_supabase_db_secret_by_environment");
    expect(platform).toContain('terraform init -backend-config="bucket=$TF_STATE_BUCKET_NAME"');
  });

  it("recovers cleanly when managed Supabase projects were deleted", async () => {
    const bootstrap = await readWorkflow("scripts/bootstrap-terraform-imports.mjs");
    const platform = await readWorkflow("infra/terraform/platform/main.tf");

    expect(bootstrap).toContain('terraform(["state", "rm", address])');
    expect(bootstrap).toContain("Terraform may create it.");
    expect(bootstrap).toContain("points to deleted Supabase project");
    expect(platform).not.toContain("legacy_api_keys_enabled");
  });
});
