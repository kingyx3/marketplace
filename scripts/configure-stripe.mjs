#!/usr/bin/env node
import Stripe from "stripe";
import { appendFile } from "node:fs/promises";
import { inspect } from "node:util";

const DEFAULT_WEBHOOK_EVENTS = Object.freeze([
  "payment_intent.amount_capturable_updated",
  "payment_intent.succeeded",
  "payment_intent.payment_failed",
  "charge.refunded",
]);

const MANAGED_BY = "marketplace-bootstrap";
const WEBHOOK_PATH = "/api/webhooks/stripe";

const args = new Set(process.argv.slice(2));
const mode = args.has("--apply")
  ? "apply"
  : args.has("--apply-if-configured")
    ? "apply-if-configured"
    : args.has("--verify")
      ? "verify"
      : "plan";

const allowSecretLogging =
  args.has("--print-created-secret") &&
  (!process.env.GITHUB_ACTIONS || process.env.ALLOW_SECRET_LOGGING === "true");

const config = buildConfig(process.env);

try {
  if (mode === "plan") {
    await printPlan(config);
  } else if (mode === "verify") {
    await verifyWebhookEndpoint(config, { strict: true });
  } else {
    await applyWebhookEndpoint(config, {
      skipWhenMissing: mode === "apply-if-configured",
      allowSecretLogging,
    });
    await verifyWebhookEndpoint(config, { strict: false });
  }
} catch (error) {
  fail(redact(error?.message || String(error)));
}

function buildConfig(env) {
  const siteUrl = normalizeOrigin(env.NEXT_PUBLIC_SITE_URL || "");
  const webhookUrl = siteUrl ? `${siteUrl}${WEBHOOK_PATH}` : "";
  const targetEnv = env.TARGET_ENV || "";
  const appName = env.APP_NAME || "Marketplace";
  const enabledEvents = parseEnabledEvents(env.STRIPE_WEBHOOK_ENABLED_EVENTS);

  return {
    appName,
    targetEnv,
    siteUrl,
    webhookUrl,
    secretKey: env.STRIPE_SECRET_KEY || "",
    webhookSecret: env.STRIPE_WEBHOOK_SECRET || "",
    webhookEndpointId: env.STRIPE_WEBHOOK_ENDPOINT_ID || "",
    enabledEvents,
    description: `${appName}${targetEnv ? ` ${targetEnv}` : ""} Stripe webhook`,
  };
}

async function printPlan(config) {
  const plan = {
    stripeAccount: {
      webhookEndpointIdEnv: config.webhookEndpointId || "<not set>",
      webhookUrl: config.webhookUrl || "https://your-app.example.com/api/webhooks/stripe",
      enabledEvents: config.enabledEvents,
      description: config.description,
      canApplyWithThisScript: requiredForApply(config).length === 0,
    },
    githubEnvironment: {
      requiredSecret: "STRIPE_SECRET_KEY",
      requiredRuntimeSecret: "STRIPE_WEBHOOK_SECRET",
      optionalVariable: "STRIPE_WEBHOOK_ENDPOINT_ID",
      optionalEventsOverride: "STRIPE_WEBHOOK_ENABLED_EVENTS",
    },
    secretHandling: {
      createdWebhookSecret: "returned by Stripe only when a new endpoint is created; never logged by default",
      existingWebhookSecret: "must be kept in the matching GitHub Environment as STRIPE_WEBHOOK_SECRET",
    },
  };

  console.log(inspect(plan, { colors: false, depth: null }));

  if (config.secretKey && config.webhookUrl) {
    const stripe = createStripeClient(config);
    const endpoint = await findWebhookEndpoint(stripe, config);
    if (endpoint) {
      console.log(`Found Stripe webhook endpoint ${endpoint.id}: ${summarizeEndpoint(endpoint)}`);
    } else {
      console.log("No matching Stripe webhook endpoint was found; --apply will create one.");
    }
  }
}

async function applyWebhookEndpoint(config, { skipWhenMissing, allowSecretLogging }) {
  const missing = requiredForApply(config);
  if (missing.length > 0) {
    const message = `Stripe webhook endpoint was not applied. Missing: ${missing.join(", ")}`;
    if (skipWhenMissing) {
      console.log(message);
      await printPlan(config);
      return;
    }
    throw new Error(message);
  }

  validateEnabledEvents(config.enabledEvents);

  const stripe = createStripeClient(config);
  const current = await findWebhookEndpoint(stripe, config);

  if (current) {
    const update = desiredUpdate(current, config);
    if (Object.keys(update).length === 0) {
      console.log(`Stripe webhook endpoint ${current.id} is already configured.`);
      writeStepSummary(`Stripe webhook endpoint \`${current.id}\` is already configured for \`${config.webhookUrl}\`.`);
      return current;
    }

    const updated = await stripe.webhookEndpoints.update(current.id, update);
    console.log(`Updated Stripe webhook endpoint ${updated.id}: ${summarizeEndpoint(updated)}`);
    writeStepSummary(`Updated Stripe webhook endpoint \`${updated.id}\` for \`${config.webhookUrl}\`.`);
    return updated;
  }

  const created = await stripe.webhookEndpoints.create({
    url: config.webhookUrl,
    enabled_events: config.enabledEvents,
    description: config.description,
    metadata: desiredMetadata(config),
  });

  await exposeCreatedEndpoint(created, { allowSecretLogging });
  console.log(`Created Stripe webhook endpoint ${created.id}: ${summarizeEndpoint(created)}`);
  console.log(
    "Store the webhook signing secret as STRIPE_WEBHOOK_SECRET in the matching GitHub Environment before deploying."
  );
  console.log(
    `Optionally store STRIPE_WEBHOOK_ENDPOINT_ID=${created.id} as a GitHub Environment variable to bind future runs to this endpoint.`
  );
  writeStepSummary(
    `Created Stripe webhook endpoint \`${created.id}\` for \`${config.webhookUrl}\`. Store the signing secret as \`STRIPE_WEBHOOK_SECRET\` before deploy.`
  );
  return created;
}

async function verifyWebhookEndpoint(config, { strict }) {
  const missing = requiredForApply(config);
  if (missing.length > 0) {
    const message = `Cannot verify Stripe webhook endpoint. Missing: ${missing.join(", ")}`;
    if (strict) throw new Error(message);
    console.log(message);
    return;
  }

  if (!/^whsec_/.test(config.webhookSecret || "")) {
    const message = "STRIPE_WEBHOOK_SECRET is missing or malformed; store the endpoint signing secret before deploy.";
    if (strict) throw new Error(message);
    console.log(message);
  }

  validateEnabledEvents(config.enabledEvents);

  const stripe = createStripeClient(config);
  const endpoint = await findWebhookEndpoint(stripe, config);
  if (!endpoint) {
    const message = `No Stripe webhook endpoint exists for ${config.webhookUrl}.`;
    if (strict) throw new Error(message);
    console.log(message);
    return;
  }

  const update = desiredUpdate(endpoint, config);
  if (Object.keys(update).length > 0) {
    const message = `Stripe webhook endpoint ${endpoint.id} differs from the desired configuration.`;
    if (strict) throw new Error(message);
    console.log(message);
    return;
  }

  console.log(`Stripe webhook endpoint ${endpoint.id} verified: ${summarizeEndpoint(endpoint)}`);
}

function createStripeClient(config) {
  return new Stripe(config.secretKey, {
    appInfo: {
      name: MANAGED_BY,
      version: "1.0.0",
      url: "https://github.com/kingyx3/marketplace",
    },
  });
}

async function findWebhookEndpoint(stripe, config) {
  if (config.webhookEndpointId) {
    const endpoint = await stripe.webhookEndpoints.retrieve(config.webhookEndpointId);
    if (endpoint?.deleted) throw new Error(`Stripe webhook endpoint ${config.webhookEndpointId} is deleted.`);
    return endpoint;
  }

  const matches = (await listWebhookEndpoints(stripe)).filter((endpoint) => endpoint.url === config.webhookUrl);

  if (matches.length > 1) {
    throw new Error(
      `Found multiple Stripe webhook endpoints for ${config.webhookUrl}: ${matches
        .map((endpoint) => endpoint.id)
        .join(", ")}. Set STRIPE_WEBHOOK_ENDPOINT_ID to choose one before applying.`
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
  if (endpoint.status !== "enabled") update.status = "enabled";
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

async function exposeCreatedEndpoint(endpoint, { allowSecretLogging }) {
  if (!endpoint.secret) return;

  if (process.env.GITHUB_ACTIONS) {
    console.log(`::add-mask::${endpoint.secret}`);
  }

  await writeGithubOutput("stripe_webhook_endpoint_id", endpoint.id);
  await writeGithubOutput("stripe_webhook_secret", endpoint.secret);

  if (allowSecretLogging) {
    console.log(`Created Stripe webhook signing secret: ${endpoint.secret}`);
  } else if (process.env.GITHUB_ACTIONS) {
    console.log(
      "Created Stripe webhook signing secret. It was masked and written to this step output only; store it as STRIPE_WEBHOOK_SECRET."
    );
  } else {
    console.log(
      "Created Stripe webhook signing secret. It was not printed; rerun locally with --print-created-secret immediately after deleting/recreating the endpoint only when you need console output."
    );
  }
}

async function writeGithubOutput(key, value) {
  if (!process.env.GITHUB_OUTPUT || !value) return;
  await appendFile(process.env.GITHUB_OUTPUT, `${key}=${value}\n`, "utf8");
}

function writeStepSummary(message) {
  if (!process.env.GITHUB_STEP_SUMMARY) return;
  appendFile(process.env.GITHUB_STEP_SUMMARY, `${message}\n`, "utf8").catch(() => {});
}

function requiredForApply(config) {
  return [
    ["STRIPE_SECRET_KEY", config.secretKey],
    ["NEXT_PUBLIC_SITE_URL", config.siteUrl],
  ]
    .filter(([, value]) => !value)
    .map(([key]) => key);
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

function summarizeEndpoint(endpoint) {
  return JSON.stringify({
    url: endpoint.url,
    status: endpoint.status,
    enabled_events: endpoint.enabled_events,
  });
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
