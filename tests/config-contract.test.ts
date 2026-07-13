import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("platform config contract", () => {
  it("defines production-safe Vercel headers and API no-store caching", async () => {
    const vercel = JSON.parse(await readFile(new URL("../vercel.json", import.meta.url), "utf8"));
    const headers = flattenHeaders(vercel.headers);
    const apiHeaders = headersForSource(vercel.headers, "/api/(.*)");
    expect(vercel.framework).toBe("nextjs");
    expect(vercel.installCommand).toBe("npm ci");
    expect(vercel.buildCommand).toBe("npm run build");
    expect(headers).toMatchObject({
      "X-Frame-Options": "DENY",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(self)",
    });
    expect(apiHeaders["Cache-Control"]).toBe("no-store, max-age=0");
  });

  it("keeps database/storage/admin state in migrations", async () => {
    const migrations = await allMigrationSql();
    for (const marker of [
      "insert into storage.buckets",
      "'product-images'",
      "alter table public.waitlist_entries enable row level security",
      "create table if not exists public.listing_items",
      "create table if not exists public.storefront_configurations",
      "admin_adjust_inventory",
      "admin_review_b2b_account",
      "admin_create_supplier_purchase_order",
    ]) {
      expect(migrations).toContain(marker);
    }
  });

  it("uses one machine-readable environment contract and generated mirrors", async () => {
    const contract = JSON.parse(await readFile(new URL("../config/environment-contract.json", import.meta.url), "utf8"));
    const generator = await readFile(new URL("../scripts/generate-environment-artifacts.mjs", import.meta.url), "utf8");
    const envScript = await readFile(new URL("../scripts/generate-env.mjs", import.meta.url), "utf8");
    const runtime = await readFile(new URL("../lib/env.ts", import.meta.url), "utf8");
    const generatedRuntime = await readFile(new URL("../lib/env-contract.generated.ts", import.meta.url), "utf8");
    const example = await readFile(new URL("../.env.example", import.meta.url), "utf8");
    const reference = await readFile(new URL("../docs/generated/environment-reference.md", import.meta.url), "utf8");

    expect(contract.some((entry: { key: string }) => entry.key === "GOOGLE_AUTH_ENABLED")).toBe(true);
    expect(
      contract.find((entry: { key: string }) => entry.key === "TARGET_ENV")?.validator?.values
    ).toEqual(["development", "staging", "production"]);
    expect(generator).toContain("renderTypeScriptSchema");
    expect(envScript).toContain("config/environment-contract.json");
    expect(runtime).toContain("env-contract.generated");
    expect(generatedRuntime).toContain("serverEnvSchema");
    for (const entry of contract) {
      expect(example).toContain(`${entry.key}=`);
      expect(reference).toContain(`\`${entry.key}\``);
    }
  });

  it("exposes development-default hosted bootstrap plus staging and recovery commands", async () => {
    const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
    const versions = JSON.parse(await readFile(new URL("../config/tool-versions.json", import.meta.url), "utf8"));
    const hostedBootstrap = await readFile(new URL("../scripts/bootstrap-hosted.mjs", import.meta.url), "utf8");
    const bootstrap = await readFile(new URL("../scripts/bootstrap-environment.mjs", import.meta.url), "utf8");
    const runtime = await readFile(new URL("../scripts/reconcile-runtime-environment.mjs", import.meta.url), "utf8");
    const github = await readFile(new URL("../scripts/bootstrap-github.mjs", import.meta.url), "utf8");
    const governance = await readFile(new URL("../scripts/configure-github-governance.mjs", import.meta.url), "utf8");
    const verification = await readFile(new URL("../scripts/verify-environment.mjs", import.meta.url), "utf8");
    const bootstrapWorkflow = await readFile(new URL("../.github/workflows/bootstrap-environment.yml", import.meta.url), "utf8");

    expect(pkg.packageManager).toBe(`npm@${versions.npm}`);
    expect(pkg.scripts.bootstrap).toBe("node scripts/bootstrap-hosted.mjs");
    expect(pkg.scripts["bootstrap:all"]).toBeUndefined();
    expect(pkg.scripts["bootstrap:doctor"]).toBeDefined();
    expect(pkg.scripts["bootstrap:local"]).toBeDefined();
    expect(pkg.scripts["bootstrap:github"]).toBeDefined();
    expect(pkg.scripts["bootstrap:verify"]).toContain("verify-environment.mjs");
    expect(pkg.scripts["runtime:reconcile"]).toBeDefined();
    expect(pkg.scripts["verify:hosted:supabase"]).toBeDefined();
    expect(pkg.scripts["verify:hosted:stripe"]).toBeDefined();
    expect(pkg.scripts["verify:hosted:restore"]).toBeDefined();
    expect(pkg.scripts["config:check"]).toContain("generate-environment-artifacts.mjs --check");
    expect(hostedBootstrap).toContain('|| "development"');
    expect(hostedBootstrap).toContain('["development", "staging", "production"]');
    expect(hostedBootstrap).not.toContain('"all"');
    expect(hostedBootstrap).toContain("bootstrap.yml");
    expect(hostedBootstrap).toContain("gh\", [\"run\", \"watch\"");
    expect(hostedBootstrap).toContain("--exit-status");
    expect(bootstrap).toContain("reconcile-runtime-environment.mjs");
    expect(runtime).toContain("provision-stripe-webhook.mjs");
    expect(runtime).toContain("sync-vercel-env.mjs");
    expect(github).toContain('|| "development"');
    expect(github).toContain('if (environment === "development") return ["develop", "main"]');
    expect(github).toContain('staging: ["STAGING_DATABASE_URL", "RECOVERY_DATABASE_URL"]');
    expect(github).toContain("PRODUCTION_REVIEWERS");
    expect(governance).toContain("required_approving_review_count: 1");
    expect(governance).toContain("required_conversation_resolution: true");
    expect(governance).toContain("allow_force_pushes: false");
    expect(verification).toContain("-detailed-exitcode");
    expect(verification).toContain("configure-providers.mjs");
    expect(verification).toContain("--check-only");
    expect(verification).toContain("--skip-health");
    expect(bootstrapWorkflow).toContain("name: ZZZ-Bootstrap Environment");
    expect(bootstrapWorkflow).toContain("workflow_call:");
    expect(bootstrapWorkflow).not.toContain("workflow_dispatch:");
    expect(bootstrapWorkflow).toContain("default: apply");
    expect(bootstrapWorkflow).toContain("node scripts/verify-environment.mjs");
    expect(bootstrapWorkflow).toContain("SYNTHETIC_MONITOR_SECRET");
  });

  it("pins Terraform core/providers and enforces committed lockfiles", async () => {
    const bootstrapVersions = await readFile(new URL("../infra/terraform/bootstrap/versions.tf", import.meta.url), "utf8");
    const platformVersions = await readFile(new URL("../infra/terraform/platform/versions.tf", import.meta.url), "utf8");
    const bootstrapLock = await readFile(new URL("../infra/terraform/bootstrap/.terraform.lock.hcl", import.meta.url), "utf8");
    const platformLock = await readFile(new URL("../infra/terraform/platform/.terraform.lock.hcl", import.meta.url), "utf8");
    const dependabot = await readFile(new URL("../.github/dependabot.yml", import.meta.url), "utf8");
    const ci = await readFile(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");
    expect(bootstrapVersions).toContain('required_version = "= 1.15.8"');
    expect(platformVersions).toContain('required_version = "= 1.15.8"');
    expect(platformVersions).not.toContain('version = ">=');
    expect(bootstrapLock).toContain('provider "registry.terraform.io/hashicorp/google"');
    expect(platformLock).toContain('provider "registry.terraform.io/supabase/supabase"');
    expect(platformLock).toContain('provider "registry.terraform.io/vercel/vercel"');
    expect(dependabot).toContain("package-ecosystem: terraform");
    expect(dependabot).toContain("package-ecosystem: github-actions");
    expect(ci).toContain("terraform-validation:");
    expect(ci).toContain("terraform_version: 1.15.8");
    expect(ci).toContain("-lockfile=readonly");
    expect(ci).toContain("git diff --exit-code");
    expect(ci).toContain("include-hidden-files: true");
  });
});

function flattenHeaders(entries: Array<{ headers?: Array<{ key: string; value: string }> }>) {
  return Object.fromEntries(entries.flatMap((entry) => (entry.headers ?? []).map((header) => [header.key, header.value])));
}

function headersForSource(entries: Array<{ source: string; headers?: Array<{ key: string; value: string }> }>, source: string) {
  const entry = entries.find((candidate) => candidate.source === source);
  return Object.fromEntries((entry?.headers ?? []).map((header) => [header.key, header.value]));
}

async function allMigrationSql() {
  const dir = fileURLToPath(new URL("../supabase/migrations", import.meta.url));
  const files = (await readdir(dir)).filter((file) => file.endsWith(".sql")).sort();
  return (await Promise.all(files.map((file) => readFile(join(dir, file), "utf8")))).join("\n");
}
