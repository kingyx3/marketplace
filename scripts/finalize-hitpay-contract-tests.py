#!/usr/bin/env python3
import re
from pathlib import Path


def replace(path: str, old: str, new: str) -> None:
    target = Path(path)
    text = target.read_text(encoding="utf-8")
    if old not in text:
        raise SystemExit(f"expected text not found in {path}: {old[:80]!r}")
    target.write_text(text.replace(old, new), encoding="utf-8")


replace(
    "tests/config-contract.test.ts",
    'expect(runtime).toContain("configure-hitpay.mjs");',
    'expect(runtime).toContain("configure-providers.mjs");',
)

replace(
    "tests/admin-orders.test.ts",
    'payload: { data: { object: { id: "pi_orphan" } } },',
    'payload: { id: "pi_orphan" },',
)

replace(
    "tests/preorder-flow.test.ts",
    'expect(source).toContain("preorder-allocation-refund:");\n    expect(source).toContain("amount: row.refund_cents");\n    expect(migration).toContain("HitPay refund confirmation required");',
    'expect(source).toContain("paymentId: row.provider_charge_id");\n    expect(source).toContain("amountCents: row.refund_cents");\n    expect(migration).toContain("Stripe refund confirmation required");',
)

Path("tests/vercel-provisioned-secret-safety.test.ts").write_text(
    '''import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

async function script(path: string): Promise<string> {
  return readFile(new URL(`../scripts/${path}`, import.meta.url), "utf8");
}

describe("Vercel provisioned secret safety", () => {
  it("preserves an unreadable one-time secret unless rotation is explicit", async () => {
    const sync = await script("sync-vercel-env.mjs");

    expect(sync).toContain('const rotateProvisioned = args.includes("--rotate-provisioned")');
    expect(sync).toContain("entry.provisioned && !rotateProvisioned");
    expect(sync).toContain(
      "Cannot rotate provisioned Vercel environment variable without a desired value"
    );
    expect(sync).toContain('fail("--rotate-provisioned cannot be combined with --check-only")');
    expect(sync).toContain('expectedStates.set(entry.key, { mode: "exists" })');
  });

  it("keeps HitPay credentials operator-managed instead of generating or rotating them", async () => {
    const reconcile = await script("reconcile-runtime-environment.mjs");
    const configure = await script("configure-hitpay.mjs");

    expect(reconcile).not.toContain("delete provisionEnvironment.HITPAY_WEBHOOK_SALT");
    expect(reconcile).not.toContain("delete process.env.HITPAY_WEBHOOK_SALT");
    expect(reconcile).not.toContain('credentials.HITPAY_WEBHOOK_SALT');
    expect(configure).toContain("HITPAY_API_KEY");
    expect(configure).not.toContain("HITPAY_WEBHOOK_SALT");
  });

  it("keeps readiness checks non-mutating for optional and sensitive values", async () => {
    const verify = await script("verify-environment.mjs");

    expect(verify).toContain('"--check-only"');
    expect(verify).toContain('"--preserve-unset-optional"');
    expect(verify).not.toContain('"--rotate-provisioned"');
  });
});
''',
    encoding="utf-8",
)

path = Path("tests/vercel-sensitive-environment.test.ts")
text = path.read_text(encoding="utf-8")
text = re.sub(
    r'''  it\("does not replace a matching HitPay webhook when Vercel stores an unreadable signing secret", \(\) => \{.*?\n  \}\);\n\n  it\("uses authoritative API reads and avoids vercel env run precedence", async \(\) => \{.*?\n  \}\);''',
    '''  it("does not require the webhook salt to discover or reconcile the HitPay endpoint", () => {
    const result = runModule<{ action: string; requests: string[] }>(`
      import { buildHitPayWebhookConfig, reconcileHitPayWebhook } from './scripts/lib/hitpay-webhook.mjs';
      const config = buildHitPayWebhookConfig({
        APP_NAME: 'Marketplace', TARGET_ENV: 'development', NEXT_PUBLIC_SITE_URL: 'https://dev.example.com',
        HITPAY_API_KEY: 'sk_test_x'
      });
      const endpoint = {
        id: 'we_1', name: config.webhookName, url: config.webhookUrl, event_types: config.enabledEvents
      };
      const requests = [];
      globalThis.fetch = async (input) => {
        requests.push(String(input));
        return new Response(JSON.stringify([endpoint]), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        });
      };
      const reconciled = await reconcileHitPayWebhook(config);
      console.log(JSON.stringify({ action: reconciled.action, requests }));
    `);

    expect(result).toEqual({
      action: "unchanged",
      requests: ["https://api.sandbox.hit-pay.com/v1/webhook-events"],
    });
  });

  it("uses authoritative API reads and avoids vercel env run precedence", async () => {
    const sync = await readFile(new URL("../scripts/sync-vercel-env.mjs", import.meta.url), "utf8");
    const reconcile = await readFile(
      new URL("../scripts/reconcile-runtime-environment.mjs", import.meta.url),
      "utf8"
    );
    const configure = await readFile(
      new URL("../scripts/configure-hitpay.mjs", import.meta.url),
      "utf8"
    );
    const verify = await readFile(
      new URL("../scripts/verify-environment.mjs", import.meta.url),
      "utf8"
    );

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
    expect(configure).toContain("buildHitPayWebhookConfig(process.env)");
    expect(configure).not.toContain("HITPAY_WEBHOOK_SALT");
    expect(verify).toContain("buildEnvironmentWithVercelFallback");
    expect(verify).not.toContain('"env", "run"');
  });''',
    text,
    flags=re.S,
)
if text == path.read_text(encoding="utf-8"):
    raise SystemExit("failed to replace Vercel sensitive HitPay tests")
path.write_text(text, encoding="utf-8")

Path(__file__).unlink()
