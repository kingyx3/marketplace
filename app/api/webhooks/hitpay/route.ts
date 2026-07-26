import { createHmac, timingSafeEqual } from "node:crypto";

import { after, NextResponse } from "next/server";

import { badRequest, serviceUnavailable } from "@/lib/api/errors";
import { withApiHandler } from "@/lib/api/handler";
import { runCommerceWorker } from "@/lib/commerce-worker";
import { logError, logWarn } from "@/lib/observability";
import { reportOperationalFailure } from "@/lib/operational-alerts";
import { createSecretClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export const POST = withApiHandler(
  "/api/webhooks/hitpay",
  async (request, context) => {
    const salt = process.env.HITPAY_WEBHOOK_SALT;
    if (!salt) {
      const error = new Error("missing webhook salt");
      await reportOperationalFailure(
        {
          event: "hitpay.webhook.not_configured",
          severity: "critical",
          summary: "HitPay webhook signing is not configured",
          context,
        },
        error,
      );
      throw serviceUnavailable("Webhook signing is not configured");
    }

    const signature = request.headers.get("hitpay-signature");
    if (!signature) throw badRequest("Missing signature");

    const rawBody = await request.text();
    if (!validSignature(rawBody, signature, salt)) {
      logWarn("hitpay.webhook.invalid_signature", context);
      throw badRequest("Invalid signature");
    }

    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(rawBody) as Record<string, unknown>;
    } catch {
      throw badRequest("Invalid payload");
    }

    const object = normalizeHitPayEventHeader(
      request.headers.get("hitpay-event-object"),
    );
    const type = normalizeHitPayEventHeader(
      request.headers.get("hitpay-event-type"),
    );
    const eventType = `${object}.${type}`;
    const providerId = typeof payload.id === "string" ? payload.id : "unknown";
    const eventId = `${eventType}:${providerId}:${String(payload.status ?? "unknown")}`;
    const auditPayload = hitPayEventAuditEnvelope({ object, type, payload });

    let supabase: ReturnType<typeof createSecretClient>;
    try {
      supabase = createSecretClient();
    } catch (error) {
      await reportOperationalFailure(
        {
          event: "hitpay.webhook.database_not_configured",
          severity: "critical",
          summary: "HitPay webhook inbox database access is not configured",
          context: { ...context, eventId, eventType },
        },
        error,
      );
      throw serviceUnavailable("Payment settlement temporarily unavailable");
    }

    const { error } = await supabase.from("webhook_events").insert({
      provider: "hitpay",
      event_id: eventId,
      event_type: eventType,
      payload: auditPayload,
      status: "received",
      processed_at: null,
      next_attempt_at: new Date().toISOString(),
    });
    if (error) {
      if (error.code === "23505") {
        return NextResponse.json({ received: true, duplicate: true });
      }
      logError("hitpay.webhook.storage_failed", error, {
        ...context,
        eventId,
        eventType,
      });
      await reportOperationalFailure(
        {
          event: "hitpay.webhook.storage_failed",
          severity: "critical",
          summary: "A verified HitPay webhook could not be durably stored",
          context: { ...context, eventId, eventType },
        },
        error,
      );
      throw serviceUnavailable("Webhook storage is temporarily unavailable");
    }

    after(async () => {
      try {
        await runCommerceWorker(supabase, { batchSize: 10 });
      } catch (workerError) {
        logError("hitpay.webhook.worker_trigger_failed", workerError, {
          ...context,
          eventId,
          eventType,
        });
      }
    });

    return NextResponse.json({ received: true, queued: true });
  },
  { timeoutMs: 10_000 },
);

export function normalizeHitPayEventHeader(value: string | null): string {
  return value?.trim().toLowerCase() || "unknown";
}

export function validSignature(
  rawBody: string,
  signature: string,
  salt: string,
): boolean {
  const expected = createHmac("sha256", salt).update(rawBody).digest("hex");
  const received = signature.trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(received)) return false;
  return timingSafeEqual(
    Buffer.from(expected, "hex"),
    Buffer.from(received, "hex"),
  );
}

export function hitPayEventAuditEnvelope(event: {
  object: string;
  type: string;
  payload: Record<string, unknown>;
}): Record<string, unknown> {
  return {
    id: stringOrNull(event.payload.id),
    object: event.object,
    type: event.type,
    status: stringOrNull(event.payload.status),
    amount: moneyOrNull(event.payload.amount),
    currency: stringOrNull(event.payload.currency),
    reference_number: stringOrNull(event.payload.reference_number),
    payments: providerMovements(event.payload.payments),
    refunds: providerMovements(event.payload.refunds),
  };
}

function providerMovements(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (entry): entry is Record<string, unknown> =>
        Boolean(entry) && typeof entry === "object",
    )
    .map((entry) => ({
      id: stringOrNull(entry.id),
      status: stringOrNull(entry.status),
      amount: moneyOrNull(entry.amount),
      currency: stringOrNull(entry.currency),
      refunded_amount: moneyOrNull(entry.refunded_amount),
    }));
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function moneyOrNull(value: unknown): string | number | null {
  return typeof value === "string" || typeof value === "number" ? value : null;
}
