import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
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
});

function runModule<T>(source: string): T {
  const result = spawnSync(process.execPath, ["--input-type=module", "-e", source], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  return JSON.parse(result.stdout);
}
