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
      "Content-Security-Policy": "frame-ancestors 'none'; base-uri 'self'; object-src 'none'",
    });
    expect(apiHeaders["Cache-Control"]).toBe("no-store, max-age=0");
  });

  it("keeps product image storage bucket and policies in migrations", async () => {
    const migrations = await allMigrationSql();

    expect(migrations).toContain("insert into storage.buckets");
    expect(migrations).toContain("'product-images'");
    expect(migrations).toContain(
      "grant select on table storage.objects to anon, authenticated, service_role"
    );
    expect(migrations).toContain(
      "grant insert, update, delete on table storage.objects to authenticated, service_role"
    );
    expect(migrations).toContain("product images are publicly readable");
    expect(migrations).toContain("staff can upload product images");
    expect(migrations).toContain("staff can update product images");
    expect(migrations).toContain("staff can delete product images");
    expect(migrations).toContain("public.current_user_is_staff");
    expect(migrations).toContain("admin_review_b2b_account");
    expect(migrations).toContain("b2b_accounts_review_status_check");
    expect(migrations).toContain("admin_remove_b2b_pricing_tier");
    expect(migrations).toContain("pricing tier assignment not found");
    expect(migrations).toContain("admin_create_supplier_purchase_order");
    expect(migrations).toContain("ADMIN_SUPPLIER_PO_INTAKE");
    expect(migrations).toContain("drop trigger if exists audit_log on public.purchase_orders");
    expect(migrations).toContain("drop trigger if exists audit_log on public.purchase_order_items");
    expect(migrations).toContain("admin_upsert_catalog_product");
    expect(migrations).toContain("admin_upsert_booster_box_sku");
    expect(migrations).toContain("admin_set_product_image");
    expect(migrations).toContain("admin_adjust_inventory");
    expect(migrations).toContain("ADMIN_INVENTORY_ADJUSTMENT");
    expect(migrations).toContain("create table if not exists public.waitlist_entries");
    expect(migrations).toContain("alter table public.waitlist_entries enable row level security");
    expect(migrations).toContain(
      "grant select on table public.waitlist_entries to authenticated, service_role"
    );
    expect(migrations).toContain(
      "grant insert, update, delete on table public.waitlist_entries to service_role"
    );
    expect(migrations).toContain("own waitlist entries");
  });

  it("keeps admin-managed storefront listing tables and RPCs in migrations", async () => {
    const migrations = await allMigrationSql();

    expect(migrations).toContain("create table if not exists public.listing_items");
    expect(migrations).toContain("create table if not exists public.storefront_configurations");
    expect(migrations).toContain("alter table public.listing_items enable row level security");
    expect(migrations).toContain(
      "alter table public.storefront_configurations enable row level security"
    );
    expect(migrations).toContain("published listing items readable");
    expect(migrations).toContain("active storefront configurations readable");
    expect(migrations).toContain("create_default_listing_item");
    expect(migrations).toContain("admin_upsert_listing_item");
    expect(migrations).toContain("admin_upsert_storefront_configuration");
    expect(migrations).toContain("ADMIN_LISTING_ITEM_UPDATE");
    expect(migrations).toContain("ADMIN_STOREFRONT_CONFIG_UPDATE");
  });

  it("runs config verifier scripts and supports unified provider bootstrap automation", async () => {
    const ci = await readFile(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");
    const bootstrapWorkflow = await readFile(
      new URL("../.github/workflows/bootstrap-environment.yml", import.meta.url),
      "utf8"
    );
    const providerWorkflow = await readFile(
      new URL("../.github/workflows/configure-providers.yml", import.meta.url),
      "utf8"
    );
    const packageJson = JSON.parse(
      await readFile(new URL("../package.json", import.meta.url), "utf8")
    );
    const syncScript = await readFile(
      new URL("../scripts/sync-vercel-env.mjs", import.meta.url),
      "utf8"
    );
    const providerScript = await readFile(
      new URL("../scripts/configure-providers.mjs", import.meta.url),
      "utf8"
    );
    const googleOAuthScript = await readFile(
      new URL("../scripts/configure-google-oauth.mjs", import.meta.url),
      "utf8"
    );
    const stripeScript = await readFile(
      new URL("../scripts/configure-stripe.mjs", import.meta.url),
      "utf8"
    );
    const envScript = await readFile(new URL("../scripts/generate-env.mjs", import.meta.url), "utf8");
    const envExample = await readFile(new URL("../.env.example", import.meta.url), "utf8");
    const environmentsDoc = await readFile(new URL("../docs/environments.md", import.meta.url), "utf8");
    const bootstrapDoc = await readFile(new URL("../docs/bootstrap.md", import.meta.url), "utf8");
    const supabaseConfig = await readFile(new URL("../supabase/config.toml", import.meta.url), "utf8");

    expect(packageJson.scripts["config:check"]).toContain("verify-vercel-config.mjs");
    expect(packageJson.scripts["config:check"]).toContain("verify-supabase-config.mjs");
    expect(packageJson.scripts["providers:plan"]).toContain("configure-providers.mjs --plan");
    expect(packageJson.scripts["providers:apply"]).toContain("configure-providers.mjs --apply");
    expect(packageJson.scripts["providers:verify"]).toContain("configure-providers.mjs --verify");
    expect(packageJson.scripts["oauth:google:plan"]).toBeUndefined();
    expect(packageJson.scripts["stripe:plan"]).toBeUndefined();
    expect(packageJson.scripts["test:e2e"]).toBe("playwright test");
    expect(packageJson.devDependencies["@tailwindcss/postcss"]).toBeDefined();
    expect(packageJson.devDependencies["eslint-config-prettier"]).toBeDefined();
    expect(ci).toContain("npm run config:check");
    expect(ci).toContain("e2e-smoke:");
    expect(ci).toContain("npx playwright install --with-deps chromium");
    expect(ci).toContain("npm run test:e2e");
    expect(ci).toContain("tests/config-contract.test.ts");
    expect(ci).toContain("docs/bootstrap.md");
    expect(ci).toContain("docs/provisioning.md");
    expect(syncScript).toContain("ENV_CONTRACT");
    expect(syncScript).toContain("parseDotenv");
    expect(supabaseConfig).toContain("[auth.external.google]");
    expect(supabaseConfig).toContain("SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID");
    expect(supabaseConfig).toContain("SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_SECRET");
    expect(supabaseConfig).toContain("http://127.0.0.1:54321/auth/v1/callback");
    expect(providerScript).toContain("scripts/configure-google-oauth.mjs");
    expect(providerScript).toContain("scripts/configure-stripe.mjs");
    expect(providerScript).toContain("passthroughArgs");
    expect(googleOAuthScript).toContain("external_google_enabled");
    expect(googleOAuthScript).toContain("GOOGLE_OAUTH_CLIENT_ID");
    expect(googleOAuthScript).not.toContain("SUPABASE_AUTH_GOOGLE_CLIENT_ID");
    expect(stripeScript).toContain("webhookEndpoints.create");
    expect(stripeScript).toContain("webhookEndpoints.update");
    expect(stripeScript).toContain("payment_intent.amount_capturable_updated");
    expect(stripeScript).toContain("--print-created-secret");
    expect(stripeScript).toContain("update.disabled = false");
    expect(stripeScript).not.toContain("writeGithubOutput");
    expect(stripeScript).not.toContain("add-mask");
    expect(providerWorkflow).toContain("name: Configure Providers");
    expect(providerWorkflow).toContain("configure-providers.mjs --${{ inputs.mode }}");
    expect(providerWorkflow).toContain("GOOGLE_OAUTH_CLIENT_ID");
    expect(providerWorkflow).toContain("STRIPE_WEBHOOK_ENDPOINT_ID");
    expect(providerWorkflow).toContain("STRIPE_WEBHOOK_ENABLED_EVENTS");
    expect(bootstrapWorkflow).toContain("configure-providers.mjs --apply-if-configured");
    expect(envScript).toContain("GOOGLE_OAUTH_CLIENT_ID");
    expect(envScript).toContain("STRIPE_WEBHOOK_ENABLED_EVENTS");
    expect(envScript).toContain("VERCEL_ORG_ID");
    expect(envScript).not.toContain("VERCEL_SCOPE_ID");
    expect(envScript).not.toContain("SUPABASE_AUTH_GOOGLE_CLIENT_ID");
    expect(envExample).toContain("personal user id on Hobby");
    expect(envExample).not.toContain("SUPABASE_AUTH_GOOGLE_CLIENT_ID");
    expect(environmentsDoc).toContain("personal Vercel user id");
    expect(environmentsDoc).toContain("VERCEL_TEAM_ID");
    expect(environmentsDoc).toContain("first Stripe webhook endpoint");
    expect(bootstrapDoc).toContain("npm run providers:apply -- --print-created-secret");
  });
});

function flattenHeaders(entries: Array<{ headers?: Array<{ key: string; value: string }> }>) {
  return Object.fromEntries(
    entries.flatMap((entry) => (entry.headers ?? []).map((header) => [header.key, header.value]))
  );
}

function headersForSource(
  entries: Array<{ source: string; headers?: Array<{ key: string; value: string }> }>,
  source: string
) {
  const entry = entries.find((candidate) => candidate.source === source);
  return Object.fromEntries((entry?.headers ?? []).map((header) => [header.key, header.value]));
}

async function allMigrationSql() {
  const dir = fileURLToPath(new URL("../supabase/migrations", import.meta.url));
  const files = (await readdir(dir)).filter((file) => file.endsWith(".sql")).sort();
  const contents = await Promise.all(files.map((file) => readFile(join(dir, file), "utf8")));
  return contents.join("\n");
}
