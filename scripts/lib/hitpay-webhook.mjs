const DEFAULT_EVENTS = [
  "payment_request.completed",
  "payment_request.failed",
  "charge.updated",
];

export function buildHitPayWebhookConfig(env = process.env) {
  const siteUrl = String(env.NEXT_PUBLIC_SITE_URL || "").replace(/\/$/, "");
  return {
    apiKey: String(env.HITPAY_API_KEY || ""),
    apiUrl: String(env.HITPAY_API_URL || "https://api.sandbox.hit-pay.com").replace(
      /\/$/,
      ""
    ),
    siteUrl,
    targetEnv: String(env.TARGET_ENV || ""),
    webhookUrl: siteUrl ? `${siteUrl}/api/webhooks/hitpay` : "",
    webhookId: String(env.HITPAY_WEBHOOK_ID || ""),
    enabledEvents: parseEvents(env.HITPAY_WEBHOOK_ENABLED_EVENTS),
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
  const webhooks = await listHitPayWebhooks(config);
  const existing = webhooks.find(
    (item) => item.id === config.webhookId || item.url === config.webhookUrl
  );
  if (existing) return { action: "verified", webhook: existing };

  const webhook = await hitPayRequest(config, "/v1/webhook-events", {
    method: "POST",
    body: JSON.stringify({
      url: config.webhookUrl,
      event_types: config.enabledEvents,
    }),
  });
  return { action: "created", webhook };
}

export async function verifyHitPayWebhook(config) {
  const webhooks = await listHitPayWebhooks(config);
  const existing = webhooks.find(
    (item) => item.id === config.webhookId || item.url === config.webhookUrl
  );
  if (!existing) {
    throw new Error(`HitPay webhook is not registered for ${config.webhookUrl}`);
  }

  const actual = Array.isArray(existing.event_types) ? existing.event_types : [];
  const missing = config.enabledEvents.filter((event) => !actual.includes(event));
  if (missing.length) {
    throw new Error(`HitPay webhook is missing events: ${missing.join(", ")}`);
  }
  return existing;
}

function parseEvents(value) {
  if (Array.isArray(value)) return value;
  const events = String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return events.length ? events : DEFAULT_EVENTS;
}
