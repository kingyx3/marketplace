import { createHmac } from "node:crypto";
import { logError, logInfo, sanitizeLogValue, type LogContext } from "@/lib/observability";

const ALERT_TIMEOUT_MS = 5_000;

export interface OperationalAlert {
  event: string;
  summary: string;
  severity: "warning" | "critical";
  context?: LogContext;
}

export async function sendOperationalAlert(alert: OperationalAlert): Promise<void> {
  const endpoint = process.env.OPERATIONAL_ALERT_WEBHOOK_URL;
  if (!endpoint) {
    if (isProduction()) {
      throw new Error("OPERATIONAL_ALERT_WEBHOOK_URL is not configured");
    }
    logInfo("operational_alert.skipped", {
      alertEvent: alert.event,
      reason: "not_configured_outside_production",
    });
    return;
  }

  const payload = JSON.stringify({
    version: 1,
    timestamp: new Date().toISOString(),
    service: "marketplace",
    environment:
      process.env.VERCEL_ENV ?? process.env.TARGET_ENV ?? process.env.NODE_ENV ?? "unknown",
    severity: alert.severity,
    event: alert.event,
    summary: alert.summary.slice(0, 300),
    context: sanitizeLogValue(alert.context ?? {}),
  });
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "user-agent": "marketplace-operational-alerts/1",
  };
  const secret = process.env.OPERATIONAL_ALERT_WEBHOOK_SECRET;
  if (secret) {
    headers["x-marketplace-signature"] = `sha256=${createHmac("sha256", secret)
      .update(payload)
      .digest("hex")}`;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ALERT_TIMEOUT_MS);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: payload,
      signal: controller.signal,
      cache: "no-store",
    });
    if (!response.ok) {
      throw new Error(`alert destination returned HTTP ${response.status}`);
    }
    logInfo("operational_alert.delivered", {
      alertEvent: alert.event,
      severity: alert.severity,
      status: response.status,
    });
  } catch (error) {
    logError("operational_alert.delivery_failed", error, {
      alertEvent: alert.event,
      severity: alert.severity,
    });
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function reportOperationalFailure(
  alert: OperationalAlert,
  originalError?: unknown
): Promise<void> {
  try {
    await sendOperationalAlert(alert);
  } catch (deliveryError) {
    logError("operational_alert.secondary_failure", deliveryError, {
      alertEvent: alert.event,
      originalErrorName: originalError instanceof Error ? originalError.name : undefined,
    });
  }
}

function isProduction(): boolean {
  return process.env.VERCEL_ENV === "production" || process.env.TARGET_ENV === "production";
}
