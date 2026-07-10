#!/usr/bin/env node
import { inspect } from "node:util";
import {
  buildStripeWebhookConfig,
  createStripeClient,
  inspectStripeWebhook,
  reconcileStripeWebhook,
  summarizeStripeWebhook,
  verifyStripeWebhook,
} from "./lib/stripe-webhook.mjs";

const args = new Set(process.argv.slice(2));
const mode = args.has("--apply")
  ? "apply"
  : args.has("--apply-if-configured")
    ? "apply-if-configured"
    : args.has("--verify")
      ? "verify"
      : "plan";
const allowSecretPrinting = args.has("--print-created-secret") && !process.env.GITHUB_ACTIONS;
const config = buildStripeWebhookConfig(process.env);

try {
  const missing = requiredInputs(config);
  if (missing.length > 0 && mode === "apply-if-configured") {
    console.log(`Stripe webhook configuration skipped. Missing: ${missing.join(", ")}`);
    printDesired(config);
  } else if (missing.length > 0) {
    throw new Error(`Stripe webhook configuration is missing: ${missing.join(", ")}`);
  } else if (mode === "plan") {
    printDesired(config);
    const state = await inspectStripeWebhook({ stripe: createStripeClient(config), config });
    console.log(inspect({
      current: state.endpoint ? JSON.parse(summarizeStripeWebhook(state.endpoint)) : null,
      changes: state.update,
      signingSecretAvailable: state.signingSecretAvailable,
    }, { colors: false, depth: null }));
  } else if (mode === "verify") {
    const endpoint = await verifyStripeWebhook({ config, requireSigningSecret: false });
    console.log(`Stripe webhook endpoint verified: ${summarizeStripeWebhook(endpoint)}`);
  } else {
    const result = await reconcileStripeWebhook({
      config,
      allowCreate: allowSecretPrinting,
      requireSigningSecret: allowSecretPrinting,
      onCredentials: async (endpointId, webhookSecret) => {
        if (!allowSecretPrinting && !config.webhookSecret) {
          throw new Error("The webhook signing secret is unavailable to this read/update-only provider workflow.");
        }
        if (allowSecretPrinting && webhookSecret !== config.webhookSecret) {
          console.log(`Created Stripe webhook signing secret: ${webhookSecret}`);
          console.log(`Created Stripe webhook endpoint id: ${endpointId}`);
          console.log("Store both values in the matching trusted secret/configuration store immediately.");
        }
      },
    });
    console.log(`Stripe webhook ${result.action}: ${summarizeStripeWebhook(result.endpoint)}`);
    await verifyStripeWebhook({ config: { ...config, webhookSecret: config.webhookSecret || result.endpoint.secret || "" }, requireSigningSecret: allowSecretPrinting });
  }
} catch (error) {
  console.error(redact(error?.message || String(error)));
  process.exit(1);
}

function printDesired(config) {
  console.log(inspect({
    webhookUrl: config.webhookUrl,
    enabledEvents: config.enabledEvents,
    description: config.description,
    endpointId: config.webhookEndpointId || null,
    createAllowed: allowSecretPrinting,
  }, { colors: false, depth: null }));
}

function requiredInputs(config) {
  return [
    ["STRIPE_SECRET_KEY", config.secretKey],
    ["NEXT_PUBLIC_SITE_URL", config.siteUrl],
    ["TARGET_ENV", config.targetEnv],
  ].filter(([, value]) => !value).map(([key]) => key);
}

function redact(value) {
  return String(value)
    .replaceAll(/sk_(test|live)_[A-Za-z0-9_\-]+/g, "[redacted-stripe-secret-key]")
    .replaceAll(/whsec_[A-Za-z0-9_\-]+/g, "[redacted-stripe-webhook-secret]");
}
