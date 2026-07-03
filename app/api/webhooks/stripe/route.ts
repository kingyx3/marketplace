import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { createStripeClient } from "@/lib/stripe";
import { createServiceClient } from "@/lib/supabase";
import { handleStripeEvent } from "@/lib/stripe-webhooks";

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
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "webhook not configured" }, { status: 503 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "missing signature" }, { status: 400 });
  }

  const rawBody = await request.text();
  let event: Stripe.Event;
  try {
    const stripe = createStripeClient();
    event = await stripe.webhooks.constructEventAsync(rawBody, signature, secret);
  } catch {
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }

  const supabase = createServiceClient();

  // Idempotency guard: unique(provider, event_id). 23505 = already processed.
  const { error: insertError } = await supabase.from("webhook_events").insert({
    provider: "stripe",
    event_id: event.id,
    event_type: event.type,
    payload: event as unknown as Record<string, unknown>,
  });
  if (insertError) {
    if (insertError.code === "23505") {
      return NextResponse.json({ received: true, duplicate: true });
    }
    console.error("webhook_events insert failed:", insertError.message);
    return NextResponse.json({ error: "storage failure" }, { status: 500 });
  }

  try {
    await handleStripeEvent(supabase, event);
  } catch (error) {
    await supabase.from("webhook_events").delete().eq("provider", "stripe").eq("event_id", event.id);
    console.error("stripe webhook processing failed:", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: "processing failure" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
