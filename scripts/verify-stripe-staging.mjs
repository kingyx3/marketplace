#!/usr/bin/env node
import { createHmac, randomUUID } from "node:crypto";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

const appUrl = requiredUrl("STAGING_APP_URL");
const publicSiteUrl = requiredUrl("NEXT_PUBLIC_SITE_URL");
const supabaseUrl = requiredUrl("NEXT_PUBLIC_SUPABASE_URL");
const supabaseSecret = required("SUPABASE_SECRET_KEY");
const stripeSecret = required("STRIPE_SECRET_KEY");
const stripePublishable = required("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY");
const webhookSecret = required("STRIPE_WEBHOOK_SECRET");

assert(stripeSecret.startsWith("sk_test_"), "staging Stripe secret key must be test mode");
assert(stripePublishable.startsWith("pk_test_"), "staging Stripe publishable key must be test mode");
assert(webhookSecret.startsWith("whsec_"), "staging Stripe webhook secret is invalid");

const stripe = new Stripe(stripeSecret);
const service = createClient(supabaseUrl, supabaseSecret, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const runId = randomUUID();
const providerPaymentId = `pi_release_gate_${runId.replaceAll("-", "")}`;
const fixtures = { customerId: null, orderId: null, paymentId: null, eventIds: [] };

try {
  await verifyStripeAccountAndPayNow();
  await verifyRegisteredWebhookEndpoint();
  await verifySignedWebhookStateMachine();
  console.log("Stripe test-mode PayNow, webhook signature, idempotency, ordering, and refund checks passed.");
} finally {
  await cleanup();
}

async function verifyStripeAccountAndPayNow() {
  const account = await stripe.accounts.retrieve();
  assert(account.country === "SG", `Stripe staging account country must be SG, received ${account.country}`);

  const intent = await stripe.paymentIntents.create(
    {
      amount: 100,
      currency: "sgd",
      payment_method_types: ["paynow"],
      description: `Marketplace release gate ${runId}`,
      metadata: { synthetic_release_gate: runId },
    },
    { idempotencyKey: `marketplace-release-gate-${runId}` }
  );
  assert(intent.livemode === false, "Stripe staging PaymentIntent unexpectedly used live mode");
  assert(intent.currency === "sgd", "PayNow PaymentIntent currency is not SGD");
  assert(intent.payment_method_types.includes("paynow"), "PayNow is not enabled on the PaymentIntent");
  assert(intent.client_secret, "PayNow PaymentIntent did not return a client secret");
  await stripe.paymentIntents.cancel(intent.id);
}

async function verifyRegisteredWebhookEndpoint() {
  const expectedUrl = new URL("/api/webhooks/stripe", publicSiteUrl).toString();
  const endpoints = [];
  for await (const endpoint of stripe.webhookEndpoints.list({ limit: 100 })) endpoints.push(endpoint);
  const matches = endpoints.filter((endpoint) => endpoint.url === expectedUrl);
  assert(matches.length === 1, `expected one Stripe webhook endpoint for ${expectedUrl}, found ${matches.length}`);
  const endpoint = matches[0];
  assert(endpoint.status === "enabled", "Stripe staging webhook endpoint is disabled");
  const enabledEvents = new Set(endpoint.enabled_events);
  for (const event of ["payment_intent.succeeded", "payment_intent.payment_failed", "charge.refunded"]) {
    assert(enabledEvents.has("*") || enabledEvents.has(event), `Stripe webhook is missing ${event}`);
  }
}

async function verifySignedWebhookStateMachine() {
  const { data: customer, error: customerError } = await service
    .from("customers")
    .insert({
      email: `release-gate-${runId}@example.test`,
      name: "Stripe Release Gate",
      segment: "player",
      default_currency: "SGD",
    })
    .select("id")
    .single();
  assertNoError(customerError, "create Stripe gate customer");
  fixtures.customerId = customer.id;

  const { data: order, error: orderError } = await service
    .from("orders")
    .insert({
      customer_id: customer.id,
      status: "pending_payment",
      currency: "SGD",
      subtotal_cents: 1000,
      shipping_cents: 0,
      tax_cents: 83,
      total_cents: 1000,
      placed_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  assertNoError(orderError, "create Stripe gate order");
  fixtures.orderId = order.id;

  const { data: payment, error: paymentError } = await service
    .from("payments")
    .insert({
      order_id: order.id,
      provider: "stripe",
      provider_payment_id: providerPaymentId,
      kind: "full",
      amount_cents: 1000,
      currency: "SGD",
      status: "pending",
    })
    .select("id")
    .single();
  assertNoError(paymentError, "create Stripe gate payment");
  fixtures.paymentId = payment.id;

  const succeeded = stripeEvent("payment_intent.succeeded", paymentIntentObject("succeeded"));
  const invalid = await postEvent(succeeded, "t=1,v1=invalid");
  assert(invalid.status === 400, `invalid Stripe signature returned ${invalid.status}`);

  const successResponse = await postEvent(succeeded);
  assert(successResponse.status === 200, `signed success webhook returned ${successResponse.status}`);
  await expectState({ orderStatus: "paid", paymentStatus: "captured" });

  const duplicate = await postEvent(succeeded);
  assert(duplicate.status === 200, `duplicate Stripe webhook returned ${duplicate.status}`);
  const duplicateBody = await duplicate.json();
  assert(duplicateBody.duplicate === true, "duplicate Stripe event was not detected");

  const failed = stripeEvent("payment_intent.payment_failed", paymentIntentObject("requires_payment_method"));
  const failedResponse = await postEvent(failed);
  assert(failedResponse.status === 200, `out-of-order failed webhook returned ${failedResponse.status}`);
  await expectState({ orderStatus: "paid", paymentStatus: "captured" });

  const partialRefundId = `re_partial_${runId.replaceAll("-", "")}`;
  const partial = stripeEvent(
    "charge.refunded",
    chargeObject(false, [{ id: partialRefundId, amount: 400, created: unixNow(), status: "succeeded" }])
  );
  const partialResponse = await postEvent(partial);
  assert(partialResponse.status === 200, `partial refund webhook returned ${partialResponse.status}`);
  await expectRefund(partialRefundId, 400);
  await expectState({ orderStatus: "paid", paymentStatus: "captured" });

  const partialReplay = stripeEvent(
    "charge.refunded",
    chargeObject(false, [{ id: partialRefundId, amount: 400, created: unixNow(), status: "succeeded" }])
  );
  const replayResponse = await postEvent(partialReplay);
  assert(replayResponse.status === 200, `refund replay returned ${replayResponse.status}`);

  const fullRefundId = `re_full_${runId.replaceAll("-", "")}`;
  const full = stripeEvent(
    "charge.refunded",
    chargeObject(true, [{ id: fullRefundId, amount: 600, created: unixNow() + 1, status: "succeeded" }])
  );
  const fullResponse = await postEvent(full);
  assert(fullResponse.status === 200, `full refund webhook returned ${fullResponse.status}`);
  await expectRefund(fullRefundId, 600);
  await expectState({ orderStatus: "refunded", paymentStatus: "refunded" });
}

function stripeEvent(type, object) {
  const event = {
    id: `evt_release_gate_${randomUUID().replaceAll("-", "")}`,
    object: "event",
    api_version: "2026-06-30.basil",
    created: unixNow(),
    data: { object },
    livemode: false,
    pending_webhooks: 1,
    request: { id: `req_${randomUUID().replaceAll("-", "")}`, idempotency_key: null },
    type,
  };
  fixtures.eventIds.push(event.id);
  return event;
}

function paymentIntentObject(status) {
  return {
    id: providerPaymentId,
    object: "payment_intent",
    amount: 1000,
    amount_received: status === "succeeded" ? 1000 : 0,
    currency: "sgd",
    metadata: { order_id: fixtures.orderId, kind: "full" },
    status,
  };
}

function chargeObject(refunded, refunds) {
  return {
    id: `ch_release_gate_${runId.replaceAll("-", "")}`,
    object: "charge",
    amount: 1000,
    amount_refunded: refunds.reduce((sum, refund) => sum + refund.amount, 0),
    currency: "sgd",
    payment_intent: providerPaymentId,
    refunded,
    refunds: { object: "list", data: refunds, has_more: false, url: "/v1/refunds" },
  };
}

async function postEvent(event, explicitSignature) {
  const payload = JSON.stringify(event);
  const timestamp = unixNow();
  const signature = explicitSignature ?? `t=${timestamp},v1=${createHmac("sha256", webhookSecret)
    .update(`${timestamp}.${payload}`)
    .digest("hex")}`;
  return fetch(new URL("/api/webhooks/stripe", appUrl), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "stripe-signature": signature,
      "x-request-id": `release-gate-${randomUUID()}`,
    },
    body: payload,
  });
}

async function expectState({ orderStatus, paymentStatus }) {
  for (let attempt = 1; attempt <= 10; attempt += 1) {
    const [order, payment] = await Promise.all([
      service.from("orders").select("status").eq("id", fixtures.orderId).single(),
      service.from("payments").select("status").eq("id", fixtures.paymentId).single(),
    ]);
    assertNoError(order.error, "read webhook order state");
    assertNoError(payment.error, "read webhook payment state");
    if (order.data.status === orderStatus && payment.data.status === paymentStatus) return;
    await sleep(attempt * 150);
  }
  throw new Error(`webhook state did not reach order=${orderStatus}, payment=${paymentStatus}`);
}

async function expectRefund(refundId, amount) {
  const { data, error } = await service
    .from("refunds")
    .select("provider_refund_id, amount_cents, status")
    .eq("provider_refund_id", refundId)
    .single();
  assertNoError(error, `read refund ${refundId}`);
  assert(data.amount_cents === amount, `refund ${refundId} amount mismatch`);
  assert(data.status === "succeeded", `refund ${refundId} status mismatch`);
}

async function cleanup() {
  if (fixtures.paymentId) await service.from("refunds").delete().eq("payment_id", fixtures.paymentId);
  if (fixtures.eventIds.length > 0) {
    await service.from("webhook_events").delete().eq("provider", "stripe").in("event_id", fixtures.eventIds);
  }
  if (fixtures.paymentId) await service.from("payments").delete().eq("id", fixtures.paymentId);
  if (fixtures.orderId) {
    await service.from("notifications").delete().contains("payload", { order_id: fixtures.orderId });
    await service.from("orders").delete().eq("id", fixtures.orderId);
  }
  if (fixtures.customerId) await service.from("customers").delete().eq("id", fixtures.customerId);
}

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}
function requiredUrl(name) {
  try {
    return new URL(required(name));
  } catch {
    throw new Error(`${name} must be a valid URL`);
  }
}
function assertNoError(error, operation) {
  if (error) throw new Error(`${operation} failed: ${error.message}`);
}
function assert(condition, message) {
  if (!condition) throw new Error(message);
}
function unixNow() {
  return Math.floor(Date.now() / 1000);
}
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
