#!/usr/bin/env node
import Stripe from "stripe";
import { appendFile } from "node:fs/promises";
import { applyVersionedEnvironmentConfig } from "./environment-config.mjs";

const DEFAULT_WEBHOOK_EVENTS = Object.freeze([
  "payment_intent.succeeded",
  "payment_intent.payment_failed",
  "charge.refunded",
]);

const MANAGED_BY = "marketplace-deploy";
const WEBHOOK_PATH = "/api/webhooks/stripe";

await applyVersionedEnvironmentConfig(process.env);

const config = buildConfig(process.env);

try {
  await reconcileWebhookEndpoint(config);
} catch (error) {
  fail(redact(error?.message || String(error)));
}

function buildConfig(env) {
  const siteUrl = normalizeOrigin(env.NEXT_PUBLIC_SITE_URL || "");
  const targetEnv = env.TARGET_ENV || "";
  const appName = env.APP_NAME || "Marketplace";

  return {
    appName,
    targetEnv,
    siteUrl,
    webhookUrl: siteUrl ? `${siteUrl}${WEBHOOK_PATH}` : "",
    secretKey: env.STRIPE_SECRET_KEY || "",
    webhookSecret: env.STRIPE_WEBHOOK_SECRET || "",
    webhookEndpointId: env.STRIPE_WEBHOOK_ENDPOINT_ID || "",
    enabledEvents: parseEnabledEvents(env.STRIPE_WEBHOOK_ENABLED_EVENTS),
    description: `${appName}${targetEnv ? ` ${targetEnv}` : ""} Stripe webhook`,
  };
}

async function reconcileWebhookEndpoint(config) {
  const missing = [
    ["STRIPE_SECRET_KEY", config.secretKey],
    ["NEXT_PUBLIC_SITE_URL", config.siteUrl],
    ["TARGET_ENV", config.targetEnv],
  ]
    .filter(([, value]) => !value)
    .map(([key]) => key);

  if (missing.length > 0) {
    throw new Error(`Cannot provision Stripe webhook. Missing: ${missing.join(", ")}`);
  }
  if (!/^(development|production)$/.test(config.targetEnv)) {
    throw new Error(`Unsupported TARGET_ENV: ${config.targetEnv}`);
  }

  validateEnabledEvents(config.enabledEvents);

  const stripe = new Stripe(config.secretKey, {
    appInfo: {
      name: MANAGED_BY,
      version: "1.0.0",
      url: "https://github.com/kingyx3/marketplace",
    },
  });

  const current = await findWebhookEndpoint(stripe, config);

  if (!current) {
    const created = await createWebhookEndpoint(stripe, config);
    await exportCreatedCredentialsWithRollback(stripe, created);
    console.log(`Created Stripe webhook endpoint ${created.id} for ${config.webhookUrl}.`);
    return;
  }

  if (!/^whsec_/.test(config.webhookSecret)) {
    const replacement = await createWebhookEndpoint(stripe, config);
    await exportCreatedCredentialsWithRollback(stripe, replacement);

    try {
      await stripe.webhookEndpoints.del(current.id);
    } catch (error) {
      if (error?.statusCode !== 404) {
        await stripe.webhookEndpoints.del(replacement.id).catch(() => {});
        throw new Error(`Could not remove stale Stripe webhook endpoint ${current.id}; replacement was rolled back.`);
      }
    }

    console.log(`Replaced Stripe webhook endpoint ${current.id} with ${replacement.id} because its signing secret was unavailable.`);
    return;
  }

  const update = desiredUpdate(current, config);
  if (Object.keys(update).length === 0) {
    await exportCredentials(current.id, config.webhookSecret);
    console.log(`Stripe webhook endpoint ${current.id} is already configured.`);
    return;
  }

  const updated = await stripe.webhookEndpoints.update(current.id, update);
  await exportCredentials(updated.id, config.webhookSecret);
  console.log(`Updated Stripe webhook endpoint ${updated.id} for ${config.webhookUrl}.`);
}

async function createWebhookEndpoint(stripe, config) {
  const created = await stripe.webhookEndpoints.create({
    url: config.webhookUrl,
    enabled_events: config.enabledEvents,
    description: config.description,
    metadata: desiredMetadata(config),
  });

  if (!created.secret || !/^whsec_/.test(created.secret)) {
    await stripe.webhookEndpoints.del(created.id).catch(() => {});
    throw new Error(`Stripe created webhook endpoint ${created.id} without returning a signing secret.`);
  }

  return created;
}

async function exportCreatedCredentialsWithRollback(stripe, endpoint) {
  try {
    await exportCredentials(endpoint.id, endpoint.secret);
  } catch (error) {
    await stripe.webhookEndpoints.del(endpoint.id).catch(() => {});
    throw error;
  }
}

async function exportCredentials(endpointId, webhookSecret) {
  const githubEnv = process.env.GITHUB_ENV;
  if (!githubEnv) {
    throw new Error("GITHUB_ENV is required to safely pass Stripe webhook credentials to later deploy steps.");
  }
  if (!/^we_/.test(endpointId) || !/^whsec_/.test(webhookSecret)) {
    throw new Error("Stripe webhook credentials are missing or malformed.");
  }

  console.log(`::add-mask::${webhookSecret}`);
  await appendFile(
    githubEnv,
    `STRIPE_WEBHOOK_SECRET=${webhookSecret}\nSTRIPE_WEBHOOK_ENDPOINT_ID=${endpointId}\n`,
    "utf8"
  );
}

async function findWebhookEndpoint(stripe, config) {
  if (config.webhookEndpointId) {
    try {
      const endpoint = await stripe.webhookEndpoints.retrieve(config.webhookEndpointId);
      if (!endpoint?.deleted) return endpoint;
    } catch (error) {
      if (error?.statusCode !== 404) throw error;
    }
  }

  const matches = (await listWebhookEndpoints(stripe)).filter((endpoint) => endpoint.url === config.webhookUrl);
  if (matches.length > 1) {
    throw new Error(
      `Found multiple Stripe webhook endpoints for ${config.webhookUrl}: ${matches
        .map((endpoint) => endpoint.id)
        .join(", ")}. Remove duplicates before deploying.`
    );
  }

  return matches[0] || null;
}

async function listWebhookEndpoints(stripe) {
  const endpoints = [];
  let startingAfter;

  do {
    const page = await stripe.webhookEndpoints.list({
      limit: 100,
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    });
    endpoints.push(...page.data);
    startingAfter = page.has_more ? page.data.at(-1)?.id : undefined;
  } while (startingAfter);

  return endpoints;
}

function desiredUpdate(endpoint, config) {
  const update = {};

  if (endpoint.url !== config.webhookUrl) update.url = config.webhookUrl;
  if (!sameStringSet(endpoint.enabled_events || [], config.enabledEvents)) update.enabled_events = config.enabledEvents;
  if (endpoint.status !== "enabled") update.disabled = false;
  if ((endpoint.description || "") !== config.description) update.description = config.description;

  const metadata = desiredMetadata(config);
  for (const [key, value] of Object.entries(metadata)) {
    if ((endpoint.metadata?.[key] || "") !== value) {
      update.metadata = metadata;
      break;
    }
  }

  return update;
}

function desiredMetadata(config) {
  return Object.fromEntries(
    Object.entries({
      managed_by: MANAGED_BY,
      target_env: config.targetEnv,
      site_url: config.siteUrl,
    }).filter(([, value]) => value)
  );
}

function parseEnabledEvents(value) {
  const events = String(value || "")
    .split(/[\s,]+/)
    .map((event) => event.trim())
    .filter(Boolean);
  return events.length > 0 ? [...new Set(events)] : [...DEFAULT_WEBHOOK_EVENTS];
}

function validateEnabledEvents(events) {
  if (events.length === 0) throw new Error("At least one Stripe webhook event must be enabled.");
  const malformed = events.filter((event) => event !== "*" && !/^[a-z0-9_]+(\.[a-z0-9_]+)+$/.test(event));
  if (malformed.length > 0) throw new Error(`Malformed Stripe webhook event(s): ${malformed.join(", ")}`);
}

function normalizeOrigin(value) {
  if (!value) return "";
  try {
    return new URL(value).origin;
  } catch {
    return "";
  }
}

function sameStringSet(left, right) {
  return [...left].sort().join("\n") === [...right].sort().join("\n");
}

function redact(value) {
  return String(value)
    .replaceAll(/sk_(test|live)_[A-Za-z0-9_\-]+/g, "[redacted-stripe-secret-key]")
    .replaceAll(/whsec_[A-Za-z0-9_\-]+/g, "[redacted-stripe-webhook-secret]");
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
