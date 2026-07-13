import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

describe("Vercel sensitive runtime environment", () => {
  it("uses environment metadata to distinguish unreadable sensitive values", () => {
    const result = runModule<Array<{ key: string; unreadable: boolean }>>(`
      import {
        genericVercelEnvironmentRecords,
        isUnreadableVercelEnvironmentRecord,
        parseVercelEnvironmentList,
      } from './scripts/lib/vercel-environment.mjs';
      const records = genericVercelEnvironmentRecords(parseVercelEnvironmentList(
        'Vercel CLI\\n' + JSON.stringify({ envs: [
          { key: 'STRIPE_WEBHOOK_SECRET', type: 'sensitive', target: ['preview'] },
          { key: 'BRANCH_ONLY', type: 'encrypted', target: ['preview'], gitBranch: 'feature' },
        ] })
      ));
      console.log(JSON.stringify([...records.values()].map((record) => ({
        key: record.key,
        unreadable: isUnreadableVercelEnvironmentRecord(record),
      }))));
    `);

    expect(result).toEqual([{ key: "STRIPE_WEBHOOK_SECRET", unreadable: true }]);
  });

  it("shares conditional requiredness between validation and Vercel reconciliation", () => {
    const result = runModule<Record<string, boolean>>(`
      import { ENV_CONTRACT, isRequiredEnvironmentEntry } from './scripts/generate-env.mjs';
      const cron = ENV_CONTRACT.find((entry) => entry.key === 'CRON_SECRET');
      const siteUrl = ENV_CONTRACT.find((entry) => entry.key === 'NEXT_PUBLIC_SITE_URL');
      console.log(JSON.stringify({
        cronDevelopment: isRequiredEnvironmentEntry(cron, { TARGET_ENV: 'development' }),
        cronProduction: isRequiredEnvironmentEntry(cron, { TARGET_ENV: 'production' }),
        siteUrlDevelopment: isRequiredEnvironmentEntry(siteUrl, { TARGET_ENV: 'development' }),
      }));
    `);

    expect(result).toEqual({
      cronDevelopment: false,
      cronProduction: true,
      siteUrlDevelopment: true,
    });
  });

  it("does not replace a matching Stripe webhook when Vercel stores an unreadable signing secret", () => {
    const result = runModule<{
      action: string;
      creates: number;
      deletes: number;
      credentials: number;
    }>(`
      import {
        buildStripeWebhookConfig,
        desiredStripeWebhookMetadata,
        reconcileStripeWebhook,
      } from './scripts/lib/stripe-webhook.mjs';
      const config = buildStripeWebhookConfig({
        APP_NAME: 'Marketplace', TARGET_ENV: 'development', NEXT_PUBLIC_SITE_URL: 'https://dev.example.com',
        STRIPE_SECRET_KEY: 'sk_test_x',
        STRIPE_WEBHOOK_ENABLED_EVENTS: 'payment_intent.succeeded payment_intent.payment_failed charge.refunded'
      });
      const endpoint = {
        id: 'we_1', url: config.webhookUrl, status: 'enabled', description: config.description,
        enabled_events: config.enabledEvents, metadata: desiredStripeWebhookMetadata(config)
      };
      const calls = { creates: 0, deletes: 0, credentials: 0 };
      const stripe = { webhookEndpoints: {
        list: async () => ({ data: [endpoint], has_more: false }),
        update: async () => endpoint,
        create: async () => { calls.creates += 1; return endpoint; },
        del: async () => { calls.deletes += 1; },
      }};
      const reconciled = await reconcileStripeWebhook({
        stripe, config, allowCreate: true, requireSigningSecret: false,
        onCredentials: async () => { calls.credentials += 1; },
      });
      console.log(JSON.stringify({ action: reconciled.action, ...calls }));
    `);

    expect(result).toEqual({ action: "unchanged", creates: 0, deletes: 0, credentials: 0 });
  });

  it("verifies sensitive values by presence while preserving one-time provisioned secrets", async () => {
    const sync = await readFile(new URL("../scripts/sync-vercel-env.mjs", import.meta.url), "utf8");
    const reconcile = await readFile(new URL("../scripts/reconcile-runtime-environment.mjs", import.meta.url), "utf8");
    const provision = await readFile(new URL("../scripts/provision-stripe-webhook.mjs", import.meta.url), "utf8");
    const verify = await readFile(new URL("../scripts/verify-environment.mjs", import.meta.url), "utf8");

    expect(sync).toContain('"env", "ls"');
    expect(sync).toContain("isRequiredEnvironmentEntry(entry, desiredEnvironment)");
    expect(sync).toContain("Missing required desired Vercel environment variable");
    expect(sync).toContain("isUnreadableVercelEnvironmentRecord(record)");
    expect(sync).toContain("entry.provisioned && currentExists");
    expect(reconcile).toContain(
      'MARKETPLACE_STRIPE_WEBHOOK_SECRET_PRESENT: storedSigningSecretPresent ? "true" : ""'
    );
    expect(reconcile).toContain('"--allow-missing-provisioned"');
    expect(provision).toContain("requireSigningSecret: !storedSigningSecretPresent");
    expect(verify).toContain('"--allow-missing-provisioned"');
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
