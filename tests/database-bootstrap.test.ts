import { readdir, readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

import {
  DATABASE_BOOTSTRAP_TARGETS,
  SEEDED_PUBLIC_TABLES,
  assertTargetSafety,
  compareBootstrapCoverage,
  discoverActivePublicTables,
} from "../scripts/bootstrap-database.mjs";

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

describe("database bootstrap", () => {
  it("is restricted to development and staging", () => {
    expect(DATABASE_BOOTSTRAP_TARGETS).toEqual(["development", "staging"]);
  });

  it("checks database safety independently from the deployment hostname", () => {
    expect(() =>
      assertTargetSafety("development", "https://development-project.supabase.co")
    ).not.toThrow();
    expect(() =>
      assertTargetSafety("development", "https://production-project.supabase.co")
    ).toThrow("production-looking database URL");
    expect(() =>
      assertTargetSafety("production", "https://development-project.supabase.co")
    ).toThrow("Production database bootstrap is prohibited");
  });

  it("has an upsert handler for every active public application table", async () => {
    const directory = new URL("../supabase/migrations/", import.meta.url);
    const filenames = (await readdir(directory)).filter((file) => file.endsWith(".sql")).sort();
    const sqlByFilename = Object.fromEntries(
      await Promise.all(
        filenames.map(async (filename) => [
          filename,
          await readFile(new URL(filename, directory), "utf8"),
        ])
      )
    );

    const activeTables = discoverActivePublicTables(sqlByFilename);
    expect(compareBootstrapCoverage(activeTables, SEEDED_PUBLIC_TABLES)).toEqual({
      missing: [],
      stale: [],
    });
    expect(SEEDED_PUBLIC_TABLES).toContain("api_rate_limit_buckets");
    expect(SEEDED_PUBLIC_TABLES).toContain("api_idempotency_records");
  });

  it("receives its environment and deployment URL from CI/CD", async () => {
    const [workflow, deploy, resolver, script, packageJson] = await Promise.all([
      read(".github/workflows/bootstrap-database.yml"),
      read(".github/workflows/deploy.yml"),
      read("scripts/resolve-terraform-inputs.mjs"),
      read("scripts/bootstrap-database.mjs"),
      read("package.json"),
    ]);
    const pkg = JSON.parse(packageJson);

    expect(workflow).toContain("name: ZZZ-Database Bootstrap (reusable)");
    expect(workflow).toContain("workflow_call:");
    expect(workflow).not.toContain("workflow_dispatch:");
    expect(workflow).toContain("environment: ${{ inputs.environment }}");
    expect(workflow).toContain("NEXT_PUBLIC_SITE_URL: ${{ inputs.deployment_url }}");
    expect(workflow).toContain("- name: Resolve Terraform inputs");
    expect(workflow).toContain("resolve-terraform-inputs.mjs bootstrap");
    expect(workflow).toContain("resolve-environment.mjs");
    expect(workflow).toContain("--verify-supabase-keys");
    expect(workflow).not.toContain("APP_NAME:");
    expect(workflow).not.toContain("VERCEL_TOKEN:");
    expect(workflow).not.toContain("SUPABASE_SECRET_KEY: ${{ secrets.");

    const resolverStep = workflow.indexOf("- name: Resolve Terraform inputs");
    const databaseStep = workflow.indexOf(
      "- name: Resolve selected database from provisioned CI/CD state"
    );
    expect(resolverStep).toBeGreaterThan(-1);
    expect(databaseStep).toBeGreaterThan(resolverStep);
    expect(workflow.slice(resolverStep, databaseStep)).toContain(
      "resolve-terraform-inputs.mjs bootstrap"
    );
    expect(workflow.slice(resolverStep, databaseStep)).not.toContain("terraform -chdir");

    expect(deploy).toContain("bootstrap-test-data:");
    expect(deploy).toContain("uses: ./.github/workflows/bootstrap-database.yml");
    expect(deploy).toContain("environment: ${{ inputs.environment }}");
    expect(deploy).toContain("deployment_url: ${{ needs.deploy.outputs.deployment_url }}");
    expect(deploy).toContain("inputs.environment != 'production'");
    expect(deploy).toContain("needs: [deploy, bootstrap-test-data]");

    expect(resolver).toContain('["state", "platform", "bootstrap"]');
    expect(resolver).toContain('mode === "bootstrap"');
    expect(pkg.scripts["db:bootstrap"]).toBe("node scripts/bootstrap-database.mjs");

    expect(script).toContain("assertTargetSafety(target, supabaseUrl);");
    expect(script).not.toContain("assertTargetSafety(target, supabaseUrl, siteUrl);");
    expect(script).toContain('rpc(client, "admin_upsert_category"');
    expect(script).toContain('rpc(client, "admin_upsert_set_release"');
    expect(script).toContain('rpc(client, "admin_upsert_catalog_product"');
    expect(script).not.toContain(
      'rpc(client, "admin_upsert_catalog_product_with_publication"'
    );
    expect(script).toContain('rpc(client, "admin_upsert_catalog_sku"');
    expect(script).toContain('rpc(client, "admin_set_sku_price"');
    expect(script).toContain('rpc(client, "admin_upsert_supplier"');
    expect(script).toContain('rpc(client, "admin_upsert_storefront_listing"');
    expect(script).toContain('rpc(client, "admin_set_listing_publication"');
    expect(script).toContain('rpc(client, "consume_api_rate_limit"');
    expect(script).toContain('rpc(client, "complete_api_idempotency"');
    expect(script).toContain("verifyAnonymousRead");
    expect(script).toContain("verifyHostedStorefront");
  });
});
