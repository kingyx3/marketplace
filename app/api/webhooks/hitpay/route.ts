import { createHmac, timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { handleHitPayEvent } from "@/lib/hitpay-webhooks";
import { logError, logInfo, logWarn, requestIdFrom, withRequestId } from "@/lib/observability";
import { reportOperationalFailure } from "@/lib/operational-alerts";
import { createServiceClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const requestId = requestIdFrom(request);
  const startedAt = Date.now();
  const context = { requestId, route: "/api/webhooks/hitpay", method: "POST" };
  const respond = (body: unknown, status = 200) =>
    withRequestId(NextResponse.json(body, { status }), requestId);

  const salt = process.env.HITPAY_WEBHOOK_SALT;
  if (!salt) {
    const error = new Error("missing webhook salt");
    logError("hitpay.webhook.not_configured", error, { ...context, status: 503 });
    await reportOperationalFailure(
      {
        event: "hitpay.webhook.not_configured",
        severity: "critical",
        summary: "HitPay webhook signing is not configured",
        context: { ...context, status: 503 },
      },
      error
    );
    return respond({ error: "webhook not configured" }, 503);
  }

  const signature = request.headers.get("hitpay-signature");
  if (!signature) {
    logWarn("hitpay.webhook.missing_signature", { ...context, status: 400 });
    return respond({ error: "missing signature" }, 400);
  }

  const rawBody = await request.text();
  if (!validSignature(rawBody, signature, salt)) {
    logWarn("hitpay.webhook.invalid_signature", { ...context, status: 400 });
    return respond({ error: "invalid signature" }, 400);
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return respond({ error: "invalid payload" }, 400);
  }

  const object = request.headers.get("hitpay-event-object")?.toLowerCase() || "unknown";
  const type = request.headers.get("hitpay-event-type")?.toLowerCase() || "unknown";
  const eventType = `${object}.${type}`;
  const providerId = typeof payload.id === "string" ? payload.id : "unknown";
  const eventId = `${eventType}:${providerId}:${String(payload.status ?? "unknown")}`;
  const eventContext = { ...context, eventId, eventType };
  const supabase = createServiceClient();

  const { error: insertError } = await supabase.from("webhook_events").insert({
    provider: "hitpay",
    event_id: eventId,
    event_type: eventType,
    payload: hitPayEventAuditEnvelope({ object, type, payload }),
  });
  if (insertError) {
    if (insertError.code === "23505") {
      return respond({ received: true, duplicate: true });
    }
    logError("hitpay.webhook.storage_failed", insertError, {
      ...eventContext,
      status: 500,
    });
    await reportOperationalFailure(
      {
        event: "hitpay.webhook.storage_failed",
        severity: "critical",
        summary: "A verified HitPay webhook could not be stored",
        context: { ...eventContext, status: 500 },
      },
      insertError
    );
    return respond({ error: "storage failure" }, 500);
  }

  try {
    await handleHitPayEvent(supabase, { object, type, payload });
  } catch (error) {
    await supabase.from("webhook_events").delete().eq("provider", "hitpay").eq("event_id", eventId);
    logError("hitpay.webhook.processing_failed", error, {
      ...eventContext,
      status: 500,
    });
    await reportOperationalFailure(
      {
        event: "hitpay.webhook.processing_failed",
        severity: "critical",
        summary: "A verified HitPay webhook failed during commercial state processing",
        context: { ...eventContext, status: 500 },
      },
      error
    );
    return respond({ error: "processing failure" }, 500);
  }

  logInfo("hitpay.webhook.processed", {
    ...eventContext,
    status: 200,
    durationMs: Date.now() - startedAt,
  });
  return respond({ received: true });
}

export function validSignature(rawBody: string, signature: string, salt: string): boolean {
  const expected = createHmac("sha256", salt).update(rawBody).digest("hex");
  const received = signature.trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(received)) return false;
  return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(received, "hex"));
}

export function hitPayEventAuditEnvelope(event: {
  object: string;
  type: string;
  payload: Record<string, unknown>;
}): Record<string, unknown> {
  return {
    id: typeof event.payload.id === "string" ? event.payload.id : null,
    object: event.object,
    type: event.type,
    status: typeof event.payload.status === "string" ? event.payload.status : null,
    amount:
      typeof event.payload.amount === "number" || typeof event.payload.amount === "string"
        ? event.payload.amount
        : null,
    currency: typeof event.payload.currency === "string" ? event.payload.currency : null,
    referenceNumber:
      typeof event.payload.reference_number === "string" ? event.payload.reference_number : null,
  };
}
