const DEFAULT_EVENTS = Object.freeze([
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
