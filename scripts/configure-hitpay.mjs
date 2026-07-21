#!/usr/bin/env node
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
