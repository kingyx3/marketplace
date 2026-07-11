import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { createStripeClient } from "@/lib/stripe";
import { createServiceClient } from "@/lib/supabase";
import { handleStripeEvent } from "@/lib/stripe-webhooks-safe";
import {
  logError,
  logInfo,
  logWarn,
  requestIdFrom,
  withRequestId,
} from "@/lib/observability";

export const dynamic = "force-dynamic";

/**
 * Stripe webhook receiver.
 *
 * Security invariants (do not relax — see docs/security.md):
 *  1. Signature is verified against STRIPE_WEBHOOK_SECRET using the raw body.
 *  2. Processing is idempotent: each event id is inserted into
 *     `webhook_events` with a unique constraint; a duplicate insert means
 *     the event was already handled and we return 200 without side effects.
 *  3. Always return 2xx for events we verified but choose to ignore, so
 *     Stripe does not retry them forever.
 */
export async function POST(request: Request) {
  const requestId = requestIdFrom(request);
  const startedAt = Date.now();
  const context = { requestId, route: "/api/webhooks/stripe", method: "POST" };
  const respond = (body: unknown, status = 200) =>
    withRequestId(NextResponse.json(body, { status }), requestId);

  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    logError("stripe.webhook.not_configured", new Error("missing signing secret"), {
      ...context,
      status: 503,
    });
    return respond({ error: "webhook not configured" }, 503);
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    logWarn("stripe.webhook.missing_signature", { ...context, status: 400 });
    return respond({ error: "missing signature" }, 400);
  }

  const rawBody = await request.text();
  let event: Stripe.Event;
  try {
    const stripe = createStripeClient();
    event = await stripe.webhooks.constructEventAsync(rawBody, signature, secret);
  } catch (error) {
    logWarn("stripe.webhook.invalid_signature", {
      ...context,
      status: 400,
      errorName: error instanceof Error ? error.name : "unknown",
    });
    return respond({ error: "invalid signature" }, 400);
  }

  const eventContext = {
    ...context,
    eventId: event.id,
    eventType: event.type,
  };
  const supabase = createServiceClient();

  const { error: insertError } = await supabase.from("webhook_events").insert({
    provider: "stripe",
    event_id: event.id,
    event_type: event.type,
    payload: stripeEventAuditEnvelope(event),
  });
  if (insertError) {
    if (insertError.code === "23505") {
      logInfo("stripe.webhook.duplicate", {
        ...eventContext,
        status: 200,
        durationMs: Date.now() - startedAt,
      });
      return respond({ received: true, duplicate: true });
    }
    logError("stripe.webhook.storage_failed", insertError, {
      ...eventContext,
      status: 500,
      durationMs: Date.now() - startedAt,
    });
    return respond({ error: "storage failure" }, 500);
  }

  try {
    await handleStripeEvent(supabase, event);
  } catch (error) {
    await supabase.from("webhook_events").delete().eq("provider", "stripe").eq("event_id", event.id);
    logError("stripe.webhook.processing_failed", error, {
      ...eventContext,
      status: 500,
      durationMs: Date.now() - startedAt,
    });
    return respond({ error: "processing failure" }, 500);
  }

  logInfo("stripe.webhook.processed", {
    ...eventContext,
    status: 200,
    durationMs: Date.now() - startedAt,
  });
  return respond({ received: true });
}

export function stripeEventAuditEnvelope(event: Stripe.Event): Record<string, unknown> {
  return {
    id: event.id,
    object: event.object,
    type: event.type,
    created: event.created,
    livemode: event.livemode,
    apiVersion: event.api_version ?? null,
    pendingWebhooks: event.pending_webhooks,
    request: event.request
      ? {
          id: event.request.id,
          idempotencyKey: event.request.idempotency_key,
        }
      : null,
  };
}
