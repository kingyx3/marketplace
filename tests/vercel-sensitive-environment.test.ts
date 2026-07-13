import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

describe("Vercel sensitive runtime environment", () => {
  it("filters target and branch records while distinguishing unreadable values", () => {
    const result = runModule<Array<{ key: string; unreadable: boolean }>>(`
      import {
        genericVercelEnvironmentRecords,
        isUnreadableVercelEnvironmentRecord,
        parseVercelEnvironmentList,
      } from './scripts/lib/vercel-environment.mjs';
      const records = genericVercelEnvironmentRecords(parseVercelEnvironmentList(
        'Vercel API\\n' + JSON.stringify({ envs: [
          { key: 'STRIPE_WEBHOOK_SECRET', type: 'sensitive', target: ['production'] },
          { key: 'ENCRYPTED_CIPHERTEXT', type: 'encrypted', decrypted: false, target: ['production'], value: 'ciphertext' },
          { key: 'ENCRYPTED_PLAINTEXT', type: 'encrypted', decrypted: true, target: ['production'], value: 'plaintext' },
          { key: 'PREVIEW_ONLY', type: 'encrypted', decrypted: true, target: ['preview'], value: 'preview' },
          { key: 'BRANCH_ONLY', type: 'encrypted', decrypted: true, target: ['production'], gitBranch: 'feature' },
        ] })
      ), 'production');
      console.log(JSON.stringify([...records.values()].map((record) => ({
        key: record.key,
        unreadable: isUnreadableVercelEnvironmentRecord(record),
      }))));
    `);

    expect(result).toEqual([
      { key: "STRIPE_WEBHOOK_SECRET", unreadable: true },
      { key: "ENCRYPTED_CIPHERTEXT", unreadable: true },
      { key: "ENCRYPTED_PLAINTEXT", unreadable: false },
    ]);
  });

  it("requests decrypted target-scoped values from the authoritative Vercel API", () => {
    const result = runModule<{ url: string; authorization: string; value: string }>(`
      import {
        fetchVercelEnvironmentRecords,
        readableVercelEnvironmentValue,
      } from './scripts/lib/vercel-environment.mjs';
      let captured;
      const records = await fetchVercelEnvironmentRecords({
        token: 'token_x', projectId: 'prj_x', teamId: 'team_x', target: 'production',
        fetchImpl: async (url, options) => {
          captured = { url: String(url), authorization: options.headers.Authorization };
          return { ok: true, status: 200, statusText: 'OK', text: async () => JSON.stringify({ envs: [
            { id: 'env_1', key: 'APP_NAME', type: 'encrypted', decrypted: true, target: ['production'], value: 'Marketplace' }
          ] }) };
        },
      });
      console.log(JSON.stringify({ ...captured, value: readableVercelEnvironmentValue(records[0]) }));
    `);

    const url = new URL(result.url);
    expect(url.origin).toBe("https://api.vercel.com");
    expect(url.pathname).toBe("/v10/projects/prj_x/env");
    expect(url.searchParams.get("teamId")).toBe("team_x");
    expect(url.searchParams.get("target")).toBe("production");
    expect(url.searchParams.get("decrypt")).toBe("true");
    expect(result.authorization).toBe("Bearer token_x");
    expect(result.value).toBe("Marketplace");
  });

  it("rejects encrypted ciphertext as a readable runtime value", () => {
    const result = runModule<{ booleanFalse: string | null; stringFalse: string | null; missingFlag: string | null }>(`
      import { readableVercelEnvironmentValue } from './scripts/lib/vercel-environment.mjs';
      console.log(JSON.stringify({
        booleanFalse: readableVercelEnvironmentValue({ type: 'encrypted', decrypted: false, value: 'ciphertext' }) ?? null,
        stringFalse: readableVercelEnvironmentValue({ type: 'encrypted', decrypted: 'false', value: 'ciphertext' }) ?? null,
        missingFlag: readableVercelEnvironmentValue({ type: 'encrypted', value: 'legacy-plaintext' }) ?? null,
      }));
    `);

    expect(result).toEqual({
      booleanFalse: null,
      stringFalse: null,
      missingFlag: "legacy-plaintext",
    });
  });

  it("creates readable encrypted records, uses the documented edit endpoint, and refuses cross-target mutations", () => {
    const result = runModule<{
      requests: Array<{ url: string; method: string; body: Record<string, unknown> }>;
      sharedError: string;
    }>(`
      import {
        createVercelEnvironmentRecord,
        updateVercelEnvironmentRecord,
      } from './scripts/lib/vercel-environment.mjs';
      const requests = [];
      const fetchImpl = async (url, options) => {
        requests.push({ url: String(url), method: options.method, body: JSON.parse(options.body) });
        return { ok: true, status: 200, statusText: 'OK', text: async () => '{}' };
      };
      await createVercelEnvironmentRecord({
        token: 'token_x', projectId: 'prj_x', teamId: 'team_x', key: 'APP_NAME', value: 'Marketplace',
        target: 'production', fetchImpl,
      });
      await updateVercelEnvironmentRecord({
        token: 'token_x', projectId: 'prj_x', teamId: 'team_x', target: 'production', value: 'Updated', fetchImpl,
        record: { id: 'env_1', key: 'APP_NAME', type: 'encrypted', target: ['production'] },
      });
      let sharedError = '';
      try {
        await updateVercelEnvironmentRecord({
          token: 'token_x', projectId: 'prj_x', target: 'production', value: 'new', fetchImpl,
          record: { id: 'env_2', key: 'APP_NAME', type: 'encrypted', target: ['preview', 'production'] },
        });
      } catch (error) {
        sharedError = error.message;
      }
      console.log(JSON.stringify({ requests, sharedError }));
    `);

    const createUrl = new URL(result.requests[0].url);
    expect(createUrl.pathname).toBe("/v10/projects/prj_x/env");
    expect(result.requests[0]).toMatchObject({
      method: "POST",
      body: {
        key: "APP_NAME",
        value: "Marketplace",
        type: "encrypted",
        target: ["production"],
      },
    });

    const updateUrl = new URL(result.requests[1].url);
    expect(updateUrl.pathname).toBe("/v9/projects/prj_x/env/env_1");
    expect(result.requests[1]).toMatchObject({
      method: "PATCH",
      body: {
        key: "APP_NAME",
        value: "Updated",
        type: "encrypted",
        target: ["production"],
      },
    });
    expect(result.sharedError).toContain("Refusing to update shared Vercel environment record APP_NAME");
  });

  it("uses only decrypted Vercel values as fallback and disables local dotenv loading", () => {
    const result = runModule<Record<string, string>>(`
      import { buildEnvironmentWithVercelFallback } from './scripts/lib/vercel-environment.mjs';
      const env = buildEnvironmentWithVercelFallback({
        target: 'production', runtimeKeys: ['APP_NAME', 'STRIPE_SECRET_KEY', 'REMOTE_ONLY'],
        records: [
          { key: 'APP_NAME', type: 'encrypted', decrypted: true, target: ['production'], value: 'Remote' },
          { key: 'STRIPE_SECRET_KEY', type: 'encrypted', decrypted: false, target: ['production'], value: 'ciphertext' },
          { key: 'REMOTE_ONLY', type: 'encrypted', decrypted: true, target: ['production'], value: 'remote-value' },
        ],
        baseEnv: { APP_NAME: 'Desired', EMPTY: '', TARGET_ENV: 'production' },
      });
      console.log(JSON.stringify(env));
    `);

    expect(result.APP_NAME).toBe("Desired");
    expect(result.REMOTE_ONLY).toBe("remote-value");
    expect(result).not.toHaveProperty("STRIPE_SECRET_KEY");
    expect(result.TARGET_ENV).toBe("production");
    expect(result.MARKETPLACE_DISABLE_LOCAL_DOTENV).toBe("true");
    expect(result).not.toHaveProperty("EMPTY");
  });

  it("does not load dotenv files in authoritative hosted child processes", () => {
    const result = runModule<{ loaded: boolean; appName: string | null }>(`
      import { mkdtemp, rm, writeFile } from 'node:fs/promises';
      import { tmpdir } from 'node:os';
      import { join } from 'node:path';
      import { loadLocalDotenv } from './scripts/generate-env.mjs';
      const directory = await mkdtemp(join(tmpdir(), 'marketplace-dotenv-'));
      const path = join(directory, '.env');
      await writeFile(path, 'APP_NAME=LocalOverride\\n');
      const env = { MARKETPLACE_DISABLE_LOCAL_DOTENV: 'true' };
      const loaded = await loadLocalDotenv(env, path);
      await rm(directory, { recursive: true, force: true });
      console.log(JSON.stringify({ loaded, appName: env.APP_NAME || null }));
    `);

    expect(result).toEqual({ loaded: false, appName: null });
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

  it("uses authoritative API reads and avoids vercel env run precedence", async () => {
    const sync = await readFile(new URL("../scripts/sync-vercel-env.mjs", import.meta.url), "utf8");
    const reconcile = await readFile(new URL("../scripts/reconcile-runtime-environment.mjs", import.meta.url), "utf8");
    const provision = await readFile(new URL("../scripts/provision-stripe-webhook.mjs", import.meta.url), "utf8");
    const verify = await readFile(new URL("../scripts/verify-environment.mjs", import.meta.url), "utf8");

    expect(sync).toContain("fetchVercelEnvironmentRecords");
    expect(sync).toContain("createVercelEnvironmentRecord");
    expect(sync).toContain("updateVercelEnvironmentRecord");
    expect(sync).toContain('type: "encrypted"');
    expect(sync).toContain("isRequiredEnvironmentEntry(entry, desiredEnvironment)");
    expect(sync).toContain("refusing unverifiable reconciliation");
    expect(sync).not.toContain('"env", "run"');
    expect(reconcile).toContain("buildEnvironmentWithVercelFallback");
    expect(reconcile).not.toContain('"env", "run"');
    expect(reconcile).toContain('process.env.MARKETPLACE_DISABLE_LOCAL_DOTENV = "true"');
    expect(provision).toContain("requireSigningSecret: !storedSigningSecretPresent");
    expect(verify).toContain("buildEnvironmentWithVercelFallback");
    expect(verify).not.toContain('"env", "run"');
    expect(verify).toContain("unreadable values verified by presence");
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
