#!/usr/bin/env node
import { appendFile, chmod, writeFile } from "node:fs/promises";
import { applyVersionedEnvironmentConfig } from "./environment-config.mjs";
import { formatDotenvCredential } from "./runtime-credentials.mjs";
import {
  buildStripeWebhookConfig,
  reconcileStripeWebhook,
  summarizeStripeWebhook,
} from "./lib/stripe-webhook.mjs";

await applyVersionedEnvironmentConfig(process.env);
const credentialsFile = valueAfter("--credentials-file");
const config = buildStripeWebhookConfig(process.env);

try {
  const result = await reconcileStripeWebhook({
    config,
    allowCreate: true,
    onCredentials: exportCredentials,
  });
  console.log(`Stripe webhook ${result.action}: ${summarizeStripeWebhook(result.endpoint)}`);
} catch (error) {
  console.error(redact(error?.message || String(error)));
  process.exit(1);
}

async function exportCredentials(endpointId, webhookSecret) {
  if (!/^we_/.test(endpointId) || !/^whsec_/.test(webhookSecret)) {
    throw new Error("Stripe webhook credentials are missing or malformed.");
  }
  console.log(`::add-mask::${webhookSecret}`);
  const content = `${formatDotenvCredential("STRIPE_WEBHOOK_SECRET", webhookSecret)}${formatDotenvCredential("STRIPE_WEBHOOK_ENDPOINT_ID", endpointId)}`;
  if (process.env.GITHUB_ENV) await appendFile(process.env.GITHUB_ENV, content, "utf8");
  if (credentialsFile) {
    await writeFile(credentialsFile, content, { encoding: "utf8", mode: 0o600 });
    await chmod(credentialsFile, 0o600);
  }
  if (!process.env.GITHUB_ENV && !credentialsFile) {
    throw new Error("GITHUB_ENV or --credentials-file is required to persist generated Stripe credentials safely.");
  }
}

function valueAfter(flag) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] || "" : "";
}

function redact(value) {
  return String(value)
    .replaceAll(/sk_(test|live)_[A-Za-z0-9_\-]+/g, "[redacted-stripe-secret-key]")
    .replaceAll(/whsec_[A-Za-z0-9_\-]+/g, "[redacted-stripe-webhook-secret]");
}
