#!/usr/bin/env python3
import json
import re
from pathlib import Path

ROOT = Path.cwd()


def write(path: str, content: str) -> None:
    target = ROOT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding="utf-8")


def update(path: str, transform) -> None:
    target = ROOT / path
    original = target.read_text(encoding="utf-8")
    changed = transform(original)
    if changed == original:
        print(f"unchanged: {path}")
        return
    target.write_text(changed, encoding="utf-8")
    print(f"updated: {path}")


# The only HitPay values that must be supplied by an operator are the API key
# and the webhook HMAC salt. Everything else is versioned or derived.
contract_path = ROOT / "config/environment-contract.json"
contract = json.loads(contract_path.read_text(encoding="utf-8"))
contract = [
    entry
    for entry in contract
    if entry["key"] not in {"HITPAY_WEBHOOK_ID", "HITPAY_WEBHOOK_ENABLED_EVENTS"}
]
for entry in contract:
    if entry["key"] == "HITPAY_API_URL":
        entry["required"] = False
        entry["hint"] = "Optional HitPay API base URL override; CI derives sandbox or production from TARGET_ENV"
        entry["default"] = "https://api.sandbox.hit-pay.com"
    elif entry["key"] == "HITPAY_PAYMENT_METHODS":
        entry["required"] = False
        entry["hint"] = "Optional comma-separated payment method override; defaults to paynow_online"
        entry["default"] = "paynow_online"
contract_path.write_text(json.dumps(contract, indent=2) + "\n", encoding="utf-8")

config_path = ROOT / "config/environments.json"
config = json.loads(config_path.read_text(encoding="utf-8"))
config.setdefault("shared", {})["HITPAY_API_URL"] = "https://api.sandbox.hit-pay.com"
config["shared"]["HITPAY_PAYMENT_METHODS"] = "paynow_online"
config["shared"].pop("HITPAY_WEBHOOK_ENABLED_EVENTS", None)
config.setdefault("environments", {}).setdefault("production", {})["HITPAY_API_URL"] = (
    "https://api.hit-pay.com"
)
config_path.write_text(json.dumps(config, indent=2) + "\n", encoding="utf-8")

write(
    "scripts/lib/hitpay-webhook.mjs",
    '''const DEFAULT_EVENTS = Object.freeze([
  "payment_request.completed",
  "payment_request.failed",
  "charge.updated",
]);

export function buildHitPayWebhookConfig(env = process.env) {
  const targetEnv = String(env.TARGET_ENV || "development").trim() || "development";
  const siteUrl = String(env.NEXT_PUBLIC_SITE_URL || "").replace(/\/$/, "");
  const appName = String(env.APP_NAME || "Marketplace").trim() || "Marketplace";
  const defaultApiUrl =
    targetEnv === "production" ? "https://api.hit-pay.com" : "https://api.sandbox.hit-pay.com";
  return {
    apiKey: String(env.HITPAY_API_KEY || ""),
    apiUrl: String(env.HITPAY_API_URL || defaultApiUrl).replace(/\/$/, ""),
    siteUrl,
    targetEnv,
    webhookUrl: siteUrl ? `${siteUrl}/api/webhooks/hitpay` : "",
    webhookName: `${appName} ${targetEnv} payments`.slice(0, 255),
    enabledEvents: [...DEFAULT_EVENTS],
  };
}

export async function hitPayRequest(config, path, init = {}) {
  const response = await fetch(`${config.apiUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "X-BUSINESS-API-KEY": config.apiKey,
      "X-Requested-With": "XMLHttpRequest",
      ...init.headers,
    },
    signal: AbortSignal.timeout(15_000),
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(
      `HitPay API ${response.status}: ${payload.message || payload.error || "request failed"}`
    );
  }
  return payload;
}

export async function listHitPayWebhooks(config) {
  const result = await hitPayRequest(config, "/v1/webhook-events", { method: "GET" });
  return Array.isArray(result) ? result : Array.isArray(result.data) ? result.data : [];
}

export async function reconcileHitPayWebhook(config) {
  assertWebhookConfig(config);
  const webhooks = await listHitPayWebhooks(config);
  const existing = webhooks.find((item) => item?.url === config.webhookUrl);
  const desired = {
    name: config.webhookName,
    url: config.webhookUrl,
    event_types: config.enabledEvents,
  };

  if (!existing) {
    const webhook = await hitPayRequest(config, "/v1/webhook-events", {
      method: "POST",
      body: JSON.stringify(desired),
    });
    return { action: "created", webhook };
  }

  if (webhookMatches(existing, config)) {
    return { action: "unchanged", webhook: existing };
  }

  const webhook = await hitPayRequest(
    config,
    `/v1/webhook-events/${encodeURIComponent(existing.id)}`,
    { method: "PUT", body: JSON.stringify(desired) }
  );
  return { action: "updated", webhook };
}

export async function verifyHitPayWebhook(config) {
  assertWebhookConfig(config);
  const webhooks = await listHitPayWebhooks(config);
  const existing = webhooks.find((item) => item?.url === config.webhookUrl);
  if (!existing) {
    throw new Error(`HitPay webhook is not registered for ${config.webhookUrl}`);
  }
  if (!webhookMatches(existing, config)) {
    throw new Error(`HitPay webhook configuration has drifted for ${config.webhookUrl}`);
  }
  return existing;
}

function assertWebhookConfig(config) {
  const missing = [
    ["HITPAY_API_KEY", config.apiKey],
    ["NEXT_PUBLIC_SITE_URL", config.siteUrl],
    ["TARGET_ENV", config.targetEnv],
  ]
    .filter(([, value]) => !value)
    .map(([key]) => key);
  if (missing.length) {
    throw new Error(`Cannot reconcile HitPay webhook. Missing: ${missing.join(", ")}`);
  }
}

function webhookMatches(existing, config) {
  const actualEvents = Array.isArray(existing?.event_types) ? [...existing.event_types].sort() : [];
  const desiredEvents = [...config.enabledEvents].sort();
  return (
    existing?.url === config.webhookUrl &&
    existing?.name === config.webhookName &&
    JSON.stringify(actualEvents) === JSON.stringify(desiredEvents)
  );
}
''',
)

write(
    "scripts/configure-hitpay.mjs",
    '''#!/usr/bin/env node
import { inspect } from "node:util";

import {
  buildHitPayWebhookConfig,
  listHitPayWebhooks,
  reconcileHitPayWebhook,
  verifyHitPayWebhook,
} from "./lib/hitpay-webhook.mjs";

const args = new Set(process.argv.slice(2));
const mode = args.has("--apply")
  ? "apply"
  : args.has("--apply-if-configured")
    ? "apply-if-configured"
    : args.has("--verify")
      ? "verify"
      : "plan";
const config = buildHitPayWebhookConfig(process.env);
const missing = [
  ["HITPAY_API_KEY", config.apiKey],
  ["NEXT_PUBLIC_SITE_URL", config.siteUrl],
  ["TARGET_ENV", config.targetEnv],
]
  .filter(([, value]) => !value)
  .map(([key]) => key);

try {
  if (missing.length > 0 && mode === "apply-if-configured") {
    console.log(`HitPay webhook configuration skipped. Missing: ${missing.join(", ")}`);
    process.exit(0);
  }
  if (missing.length > 0) {
    throw new Error(`HitPay webhook configuration is missing: ${missing.join(", ")}`);
  }

  if (mode === "plan") {
    const webhooks = await listHitPayWebhooks(config);
    console.log(
      inspect(
        {
          apiUrl: config.apiUrl,
          webhookName: config.webhookName,
          webhookUrl: config.webhookUrl,
          enabledEvents: config.enabledEvents,
          existing: webhooks.find((item) => item?.url === config.webhookUrl) || null,
        },
        { colors: false, depth: null }
      )
    );
  } else if (mode === "verify") {
    const webhook = await verifyHitPayWebhook(config);
    console.log(`HitPay webhook verified: ${webhook.id || webhook.url}`);
  } else {
    const result = await reconcileHitPayWebhook(config);
    console.log(`HitPay webhook ${result.action}: ${result.webhook.id || result.webhook.url}`);
    await verifyHitPayWebhook(config);
  }
} catch (error) {
  const message = String(error?.message || error);
  console.error(
    config.apiKey ? message.replaceAll(config.apiKey, "[redacted-hitpay-api-key]") : message
  );
  process.exit(1);
}
''',
)


def update_resolver(text: str) -> str:
    text = text.replace(
        'import { buildHitPayWebhookConfig, listHitPayWebhooks } from "./lib/hitpay-webhook.mjs";\n',
        "",
    )
    for line in [
        '  "HITPAY_WEBHOOK_ID",\n',
        '  "HITPAY_WEBHOOK_ENABLED_EVENTS",\n',
    ]:
        text = text.replace(line, "")
    for line in ['  "HITPAY_API_URL",\n', '  "HITPAY_PAYMENT_METHODS",\n']:
        # Remove only from STRICT_KEYS; the first occurrence in PUBLIC_ENV_KEYS remains.
        first = text.find(line)
        second = text.find(line, first + len(line)) if first >= 0 else -1
        if second >= 0:
            text = text[:second] + text[second + len(line) :]
    text = text.replace("  await resolveHitPayValues(env);\n", "")
    text = re.sub(
        r'function applyHitPayDefaults\(env, targetEnv\) \{.*?\n\}\n\nasync function resolveVercelValues',
        '''function applyHitPayDefaults(env, targetEnv) {
  setIfMissing(
    env,
    "HITPAY_API_URL",
    targetEnv === "production" ? "https://api.hit-pay.com" : "https://api.sandbox.hit-pay.com"
  );
  setIfMissing(env, "HITPAY_PAYMENT_METHODS", "paynow_online");
}

async function resolveVercelValues''',
        text,
        flags=re.S,
    )
    text = re.sub(
        r'\nasync function resolveHitPayValues\(env\) \{.*?\n\}\n\nasync function fetchVercelProject',
        "\nasync function fetchVercelProject",
        text,
        flags=re.S,
    )
    return text


update("scripts/resolve-environment.mjs", update_resolver)


def update_bootstrap_github(text: str) -> str:
    for line in [
        '  "HITPAY_API_URL",\n',
        '  "HITPAY_PAYMENT_METHODS",\n',
        '  "HITPAY_WEBHOOK_ID",\n',
        '  "HITPAY_WEBHOOK_ENABLED_EVENTS",\n',
    ]:
        text = text.replace(line, "")
    text = re.sub(
        r'  for \(const legacy of \["HITPAY_API_URL", "HITPAY_WEBHOOK_ID"\]\) \{\n'
        r'    deleteEnvironmentSettingIfPresent\("variable", environment, legacy\);\n'
        r'  \}',
        '''  for (const legacy of [
    "HITPAY_API_URL",
    "HITPAY_PAYMENT_METHODS",
    "HITPAY_WEBHOOK_ID",
    "HITPAY_WEBHOOK_ENABLED_EVENTS",
  ]) {
    deleteEnvironmentSettingIfPresent("variable", environment, legacy);
  }''',
        text,
    )
    text = re.sub(
        r'\n  else if \(name === "HITPAY_API_URL"\) \{.*?\n  \} else if \(name === "HITPAY_PAYMENT_METHODS"\) setVariable\(target, name, "paynow_online"\);'
        r'\n  else if \(name === "HITPAY_WEBHOOK_ENABLED_EVENTS"\) \{.*?\n  \}',
        "",
        text,
        flags=re.S,
    )
    text = text.replace(
        '  if (["SUPPORT_EMAIL", "HITPAY_WEBHOOK_ID"].includes(name)) {\n'
        '    return name === "SUPPORT_EMAIL" && target === "production";\n'
        '  }',
        '  if (name === "SUPPORT_EMAIL") return target === "production";',
    )
    return text


update("scripts/bootstrap-github.mjs", update_bootstrap_github)


def update_hitpay_client(text: str) -> str:
    return text.replace(
        '  const apiUrl = (env.HITPAY_API_URL || "https://api.sandbox.hit-pay.com").replace(/\\\/$/, "");',
        '''  const defaultApiUrl =
    env.TARGET_ENV === "production" ? "https://api.hit-pay.com" : "https://api.sandbox.hit-pay.com";
  const apiUrl = (env.HITPAY_API_URL || defaultApiUrl).replace(/\\\/$/, "");''',
    )


update("lib/hitpay.ts", update_hitpay_client)

# Workflows consume only the two HitPay secrets. Public provider values are
# derived by resolve-environment.mjs and exported through GITHUB_ENV.
for workflow in (ROOT / ".github/workflows").glob("*.yml"):
    text = workflow.read_text(encoding="utf-8")
    original = text
    text = re.sub(
        r'^\s+HITPAY_(?:API_URL|PAYMENT_METHODS|WEBHOOK_ID|WEBHOOK_ENABLED_EVENTS):\s+\$\{\{\s*vars\.[^}]+\}\}\s*\n',
        "",
        text,
        flags=re.M,
    )
    if text != original:
        workflow.write_text(text, encoding="utf-8")
        print(f"updated: {workflow.relative_to(ROOT)}")

# Replace stale source-shape tests with provider-neutral, derived-config tests.
update(
    "tests/deployment-idempotency.test.ts",
    lambda text: re.sub(
        r'  it\("keeps HitPay checkout and webhooks limited to PayNow lifecycle events".*?\n  \}\);\n\}\);',
        '''  it("derives non-secret HitPay configuration instead of requiring GitHub variables", async () => {
    const hitpay = await repoFile("lib/hitpay.ts");
    const webhook = await repoFile("scripts/lib/hitpay-webhook.mjs");
    const config = JSON.parse(await repoFile("config/environments.json"));
    const workflows = await Promise.all(
      [
        ".github/workflows/bootstrap-environment.yml",
        ".github/workflows/configure-providers.yml",
        ".github/workflows/deploy.yml",
        ".github/workflows/hosted-release-gates.yml",
      ].map(repoFile)
    );

    expect(hitpay).toContain('env.TARGET_ENV === "production"');
    expect(hitpay).toContain('env.HITPAY_PAYMENT_METHODS || "paynow_online"');
    expect(webhook).toContain('webhookName: `${appName} ${targetEnv} payments`');
    expect(webhook).toContain('"payment_request.completed"');
    expect(config.shared.HITPAY_API_URL).toBe("https://api.sandbox.hit-pay.com");
    expect(config.environments.production.HITPAY_API_URL).toBe("https://api.hit-pay.com");
    expect(config.shared).not.toHaveProperty("HITPAY_WEBHOOK_ENABLED_EVENTS");
    for (const workflow of workflows) {
      expect(workflow).not.toContain("vars.HITPAY_API_URL");
      expect(workflow).not.toContain("vars.HITPAY_PAYMENT_METHODS");
      expect(workflow).not.toContain("vars.HITPAY_WEBHOOK_ID");
      expect(workflow).not.toContain("vars.HITPAY_WEBHOOK_ENABLED_EVENTS");
      expect(workflow).toContain("secrets.HITPAY_API_KEY");
      expect(workflow).toContain("secrets.HITPAY_WEBHOOK_SALT");
    }
  });
});''',
        text,
        flags=re.S,
    ),
)

write(
    "tests/hitpay-environment-minimization.test.ts",
    '''import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

import { createHitPayClient } from "@/lib/hitpay";

const repoFile = (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

describe("HitPay environment minimization", () => {
  it("keeps only the API key and webhook salt as required HitPay secrets", async () => {
    const contract = JSON.parse(await repoFile("config/environment-contract.json"));
    const hitpay = contract.filter((entry: { section: string }) => entry.section === "HitPay");
    expect(
      hitpay.filter((entry: { required: boolean; secret: boolean }) => entry.required && entry.secret)
        .map((entry: { key: string }) => entry.key)
        .sort()
    ).toEqual(["HITPAY_API_KEY", "HITPAY_WEBHOOK_SALT"]);
    expect(hitpay.find((entry: { key: string }) => entry.key === "HITPAY_API_URL")?.required).toBe(
      false
    );
    expect(
      hitpay.find((entry: { key: string }) => entry.key === "HITPAY_PAYMENT_METHODS")?.required
    ).toBe(false);
    expect(contract.some((entry: { key: string }) => entry.key === "HITPAY_WEBHOOK_ID")).toBe(
      false
    );
    expect(
      contract.some((entry: { key: string }) => entry.key === "HITPAY_WEBHOOK_ENABLED_EVENTS")
    ).toBe(false);
  });

  it("selects sandbox and production API hosts without an explicit URL", async () => {
    const requests: string[] = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input) => {
      requests.push(String(input));
      return new Response(
        JSON.stringify({
          id: "11111111-1111-4111-8111-111111111111",
          status: "pending",
          amount: "1.00",
          currency: "SGD",
          url: "https://securecheckout.sandbox.hit-pay.com/example",
        })
      );
    };
    try {
      for (const target of ["development", "production"] as const) {
        const client = createHitPayClient({
          HITPAY_API_KEY: "test-key",
          TARGET_ENV: target,
        } as NodeJS.ProcessEnv);
        await client.createPaymentRequest({
          amountCents: 100,
          currency: "SGD",
          purpose: "Test",
          referenceNumber: `test:${target}`,
          redirectUrl: "https://shop.example/orders",
        });
      }
    } finally {
      globalThis.fetch = originalFetch;
    }
    expect(requests[0]).toBe("https://api.sandbox.hit-pay.com/v1/payment-requests");
    expect(requests[1]).toBe("https://api.hit-pay.com/v1/payment-requests");
  });
});
''',
)

# Remove migration-only diagnostics and repair helpers from the final branch.
for path in [ROOT / "scripts/temporary-hitpay-test-repair.py", ROOT / "tmp/hitpay-ci"]:
    if path.is_dir():
        for child in path.iterdir():
            child.unlink()
        path.rmdir()
    elif path.exists():
        path.unlink()

# Remove this one-shot migration script after it has applied the edits.
Path(__file__).unlink()
