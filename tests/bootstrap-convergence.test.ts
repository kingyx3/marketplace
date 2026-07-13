import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

describe("bootstrap convergence", () => {
  it("uses one Stripe desired-state implementation from every entry point", async () => {
    const configure = await readFile(new URL("../scripts/configure-stripe.mjs", import.meta.url), "utf8");
    const provision = await readFile(new URL("../scripts/provision-stripe-webhook.mjs", import.meta.url), "utf8");
    expect(configure).toContain('./lib/stripe-webhook.mjs');
    expect(provision).toContain('./lib/stripe-webhook.mjs');
    expect(configure).not.toContain("webhookEndpoints.update(");
    expect(provision).not.toContain("webhookEndpoints.update(");
  });

  it("lets Vercel populate values masked by empty GitHub placeholders", () => {
    const result = runModule<Record<string, string>>(`
      import { withoutEmptyEnvironmentValues } from './scripts/lib/process-environment.mjs';
      console.log(JSON.stringify(withoutEmptyEnvironmentValues({
        STRIPE_WEBHOOK_SECRET: '',
        OPTIONAL_SECRET: '   ',
        STRIPE_SECRET_KEY: 'sk_test_x',
        ZERO: '0'
      })));
    `);
    expect(result).toEqual({ STRIPE_SECRET_KEY: "sk_test_x", ZERO: "0" });
  });

  it("sanitizes every Vercel env run used by bootstrap apply and verification", async () => {
    const reconcile = await readFile(new URL("../scripts/reconcile-runtime-environment.mjs", import.meta.url), "utf8");
    const verify = await readFile(new URL("../scripts/verify-environment.mjs", import.meta.url), "utf8");
    expect(reconcile).toContain("const vercelEnvRunEnvironment = withoutEmptyEnvironmentValues(");
    expect(reconcile.match(/env: vercelEnvRunEnvironment/g)).toHaveLength(1);
    expect(verify.match(/env: vercelEnvRunEnvironment/g)).toHaveLength(2);
  });

  it("performs zero provider writes when the Stripe endpoint already matches", () => {
    const result = runModule<{
      action: string;
      updates: number;
      creates: number;
      deletes: number;
      credentials: number;
    }>(`
      import { buildStripeWebhookConfig, desiredStripeWebhookMetadata, reconcileStripeWebhook } from './scripts/lib/stripe-webhook.mjs';
      const config = buildStripeWebhookConfig({
        APP_NAME: 'Marketplace', TARGET_ENV: 'development', NEXT_PUBLIC_SITE_URL: 'https://dev.example.com',
        STRIPE_SECRET_KEY: 'sk_test_x', STRIPE_WEBHOOK_SECRET: 'whsec_x',
        STRIPE_WEBHOOK_ENABLED_EVENTS: 'payment_intent.succeeded payment_intent.payment_failed charge.refunded'
      });
      const endpoint = { id: 'we_1', url: config.webhookUrl, status: 'enabled', description: config.description,
        enabled_events: config.enabledEvents, metadata: desiredStripeWebhookMetadata(config) };
      const calls = { updates: 0, creates: 0, deletes: 0, credentials: 0 };
      const stripe = { webhookEndpoints: {
        retrieve: async () => endpoint,
        list: async () => ({ data: [endpoint], has_more: false }),
        update: async () => { calls.updates += 1; return endpoint; },
        create: async () => { calls.creates += 1; return endpoint; },
        del: async () => { calls.deletes += 1; },
      }};
      const reconciled = await reconcileStripeWebhook({ stripe, config, allowCreate: true,
        onCredentials: async () => { calls.credentials += 1; } });
      console.log(JSON.stringify({ action: reconciled.action, ...calls }));
    `);
    expect(result).toEqual({ action: "unchanged", updates: 0, creates: 0, deletes: 0, credentials: 1 });
  });

  it("binds Stripe config before constructing the default client", () => {
    const result = runModule<Record<string, string>>(`
      import { buildStripeWebhookConfig, reconcileStripeWebhook, verifyStripeWebhook } from './scripts/lib/stripe-webhook.mjs';
      const config = buildStripeWebhookConfig({ STRIPE_SECRET_KEY: 'sk_test_x' });
      const errors = {};
      for (const [name, operation] of Object.entries({
        reconcile: () => reconcileStripeWebhook({ config, allowCreate: true }),
        verify: () => verifyStripeWebhook({ config }),
      })) {
        try { await operation(); }
        catch (error) { errors[name] = error.message; }
      }
      console.log(JSON.stringify(errors));
    `);
    expect(result).toEqual({
      reconcile: "Cannot reconcile Stripe webhook. Missing: NEXT_PUBLIC_SITE_URL, TARGET_ENV",
      verify: "Cannot reconcile Stripe webhook. Missing: NEXT_PUBLIC_SITE_URL, TARGET_ENV",
    });
  });

  it("fails closed on Terraform state errors that are not explicit absence", () => {
    const result = runModule<Record<string, boolean>>(`
      import { isMissingRemoteObject, isMissingStateAddress } from './scripts/lib/terraform-state.mjs';
      console.log(JSON.stringify({
        noState: isMissingStateAddress('No state file was found!'),
        missingAddress: isMissingStateAddress('No instance found for the given address!'),
        permissionDenied: isMissingStateAddress('Error 403: permission denied'),
        missingRemote: isMissingRemoteObject('Cannot import non-existent remote object'),
        providerFailure: isMissingRemoteObject('provider initialization failed'),
      }));
    `);
    expect(result).toEqual({
      noState: true,
      missingAddress: true,
      permissionDenied: false,
      missingRemote: true,
      providerFailure: false,
    });
  });

  it("exports the derived state bucket for both Terraform resources and backend initialization", () => {
    const directory = mkdtempSync(join(tmpdir(), "marketplace-terraform-inputs-"));
    const githubEnv = join(directory, "github-env");
    try {
      const credentials = JSON.stringify({
        project_id: "example-project",
        client_email: "terraform@example-project.iam.gserviceaccount.com",
        private_key: "unused-for-state-resolution",
      });
      const result = spawnSync(process.execPath, ["scripts/resolve-terraform-inputs.mjs", "state"], {
        cwd: repoRoot,
        encoding: "utf8",
        env: {
          ...process.env,
          GITHUB_ENV: githubEnv,
          GITHUB_REPOSITORY: "kingyx3/marketplace",
          GCP_TERRAFORM_CREDENTIALS_JSON: credentials,
          GCP_PROJECT_ID: "",
          PROJECT_SLUG: "",
          TF_STATE_BUCKET_NAME: "",
          TF_STATE_BUCKET_LOCATION: "",
        },
      });
      if (result.status !== 0) throw new Error(result.stderr || result.stdout);
      const output = readFileSync(githubEnv, "utf8");
      expect(output).toContain("TF_STATE_BUCKET_NAME=example-project-marketplace-tfstate\n");
      expect(output).toContain("TF_VAR_state_bucket_name=example-project-marketplace-tfstate\n");
      expect(output).toContain("TF_STATE_BUCKET_LOCATION=us-central1\n");
      expect(output).toContain("TF_VAR_state_bucket_location=us-central1\n");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});

function runModule<T>(source: string): T {
  const result = spawnSync(process.execPath, ["--input-type=module", "-e", source], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  return JSON.parse(result.stdout);
}
