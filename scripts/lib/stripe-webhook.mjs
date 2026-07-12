import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

export const DEFAULT_WEBHOOK_EVENTS = Object.freeze([
  "payment_intent.succeeded",
  "payment_intent.payment_failed",
  "charge.refunded",
]);
export const STRIPE_WEBHOOK_PATH = "/api/webhooks/stripe";
export const STRIPE_MANAGED_BY = "marketplace";
export const STRIPE_MANAGED_COMPONENT = "stripe-webhook";

export function buildStripeWebhookConfig(env = process.env) {
  const siteUrl = normalizeOrigin(env.NEXT_PUBLIC_SITE_URL || "");
  const targetEnv = env.TARGET_ENV || "";
  const appName = env.APP_NAME || "Marketplace";
  return {
    appName,
    targetEnv,
    siteUrl,
    webhookUrl: siteUrl ? `${siteUrl}${STRIPE_WEBHOOK_PATH}` : "",
    secretKey: env.STRIPE_SECRET_KEY || "",
    webhookSecret: env.STRIPE_WEBHOOK_SECRET || "",
    webhookEndpointId: env.STRIPE_WEBHOOK_ENDPOINT_ID || "",
    enabledEvents: parseEnabledEvents(env.STRIPE_WEBHOOK_ENABLED_EVENTS),
    description: `${appName}${targetEnv ? ` ${targetEnv}` : ""} Stripe webhook`,
  };
}

export function createStripeClient(config) {
  const Stripe = require("stripe");
  return new Stripe(config.secretKey, {
    appInfo: {
      name: STRIPE_MANAGED_BY,
      version: "1.0.0",
      url: "https://github.com/kingyx3/marketplace",
    },
  });
}

export function validateStripeWebhookConfig(config) {
  const missing = [
    ["STRIPE_SECRET_KEY", config.secretKey],
    ["NEXT_PUBLIC_SITE_URL", config.siteUrl],
    ["TARGET_ENV", config.targetEnv],
  ]
    .filter(([, value]) => !value)
    .map(([key]) => key);
  if (missing.length > 0) throw new Error(`Cannot reconcile Stripe webhook. Missing: ${missing.join(", ")}`);
  if (!/^(development|staging|production)$/.test(config.targetEnv)) throw new Error(`Unsupported TARGET_ENV: ${config.targetEnv}`);
  validateEnabledEvents(config.enabledEvents);
}

export async function inspectStripeWebhook({ stripe, config }) {
  validateStripeWebhookConfig(config);
  const endpoint = await findWebhookEndpoint(stripe, config);
  return {
    endpoint,
    update: endpoint ? desiredUpdate(endpoint, config) : null,
    signingSecretAvailable: /^whsec_/.test(config.webhookSecret),
  };
}

export async function reconcileStripeWebhook({
  config,
  stripe = createStripeClient(config),
  allowCreate,
  requireSigningSecret = true,
  onCredentials = async () => {},
}) {
  validateStripeWebhookConfig(config);
  const current = await findWebhookEndpoint(stripe, config);

  if (!current) {
    if (!allowCreate) throw firstEndpointError(config.webhookUrl);
    const created = await createWebhookEndpoint(stripe, config);
    await deliverCredentialsOrRollback(stripe, created, onCredentials);
    return { action: "created", endpoint: created };
  }

  if (!/^whsec_/.test(config.webhookSecret) && requireSigningSecret) {
    if (!allowCreate) {
      throw new Error(
        `Stripe webhook endpoint ${current.id} exists, but its signing secret is unavailable. Run the hosted environment reconciler or a trusted local create/replace flow.`
      );
    }
    const replacement = await createWebhookEndpoint(stripe, config);
    await deliverCredentialsOrRollback(stripe, replacement, onCredentials);
    try {
      await stripe.webhookEndpoints.del(current.id);
    } catch (error) {
      await stripe.webhookEndpoints.del(replacement.id).catch(() => {});
      throw new Error(`Could not remove stale Stripe webhook endpoint ${current.id}; replacement was rolled back: ${error.message}`);
    }
    return { action: "replaced", endpoint: replacement, replacedEndpointId: current.id };
  }

  const update = desiredUpdate(current, config);
  const endpoint = Object.keys(update).length > 0
    ? await stripe.webhookEndpoints.update(current.id, update)
    : current;
  if (/^whsec_/.test(config.webhookSecret)) await onCredentials(endpoint.id, config.webhookSecret);
  return { action: Object.keys(update).length > 0 ? "updated" : "unchanged", endpoint };
}

export async function verifyStripeWebhook({ config, stripe = createStripeClient(config), requireSigningSecret = true }) {
  const state = await inspectStripeWebhook({ stripe, config });
  if (!state.endpoint) throw new Error(`No Stripe webhook endpoint exists for ${config.webhookUrl}.`);
  if (state.update && Object.keys(state.update).length > 0) {
    throw new Error(`Stripe webhook endpoint ${state.endpoint.id} differs from the desired configuration.`);
  }
  if (requireSigningSecret && !state.signingSecretAvailable) {
    throw new Error("STRIPE_WEBHOOK_SECRET is missing or malformed.");
  }
  return state.endpoint;
}

export function summarizeStripeWebhook(endpoint) {
  return JSON.stringify({
    id: endpoint.id,
    url: endpoint.url,
    status: endpoint.status,
    enabled_events: endpoint.enabled_events,
    metadata: endpoint.metadata,
  });
}

export function desiredStripeWebhookMetadata(config) {
  return Object.fromEntries(
    Object.entries({
      managed_by: STRIPE_MANAGED_BY,
      managed_component: STRIPE_MANAGED_COMPONENT,
      target_env: config.targetEnv,
      site_url: config.siteUrl,
    }).filter(([, value]) => value)
  );
}

export function desiredStripeWebhookUpdate(endpoint, config) {
  return desiredUpdate(endpoint, config);
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
      `Found multiple Stripe webhook endpoints for ${config.webhookUrl}: ${matches.map((endpoint) => endpoint.id).join(", ")}. Remove duplicates or pin STRIPE_WEBHOOK_ENDPOINT_ID.`
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

async function createWebhookEndpoint(stripe, config) {
  const created = await stripe.webhookEndpoints.create({
    url: config.webhookUrl,
    enabled_events: config.enabledEvents,
    description: config.description,
    metadata: desiredStripeWebhookMetadata(config),
  });
  if (!created.secret || !/^whsec_/.test(created.secret)) {
    await stripe.webhookEndpoints.del(created.id).catch(() => {});
    throw new Error(`Stripe created webhook endpoint ${created.id} without returning a signing secret.`);
  }
  return created;
}

async function deliverCredentialsOrRollback(stripe, endpoint, onCredentials) {
  try {
    await onCredentials(endpoint.id, endpoint.secret);
  } catch (error) {
    await stripe.webhookEndpoints.del(endpoint.id).catch(() => {});
    throw error;
  }
}

function desiredUpdate(endpoint, config) {
  const update = {};
  if (endpoint.url !== config.webhookUrl) update.url = config.webhookUrl;
  if (!sameStringSet(endpoint.enabled_events || [], config.enabledEvents)) update.enabled_events = config.enabledEvents;
  if (endpoint.status !== "enabled") update.disabled = false;
  if ((endpoint.description || "") !== config.description) update.description = config.description;

  const metadata = desiredStripeWebhookMetadata(config);
  if (Object.entries(metadata).some(([key, value]) => (endpoint.metadata?.[key] || "") !== value)) {
    update.metadata = metadata;
  }
  return update;
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

function firstEndpointError(webhookUrl) {
  return new Error(
    [
      `No Stripe webhook endpoint exists for ${webhookUrl}.`,
      "The current operation is read/update-only and cannot persist Stripe's one-time signing secret.",
      "Run npm run bootstrap:environment or deploy, or use a trusted local providers:apply -- --print-created-secret flow.",
    ].join("\n")
  );
}
