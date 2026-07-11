import { describe, expect, it } from "vitest";
import { stripeEventAuditEnvelope } from "@/app/api/webhooks/stripe/route";

describe("Stripe webhook audit envelope", () => {
  it("retains idempotency metadata without the customer or payment object", () => {
    const envelope = stripeEventAuditEnvelope({
      id: "evt_123",
      object: "event",
      type: "payment_intent.succeeded",
      created: 1_784_000_000,
      livemode: false,
      api_version: "2026-06-30.basil",
      pending_webhooks: 1,
      request: { id: "req_123", idempotency_key: "idem_123" },
      data: {
        object: {
          id: "pi_123",
          receipt_email: "buyer@example.test",
          client_secret: "pi_secret",
          shipping: { address: { line1: "private" } },
        },
      },
    } as never);

    expect(envelope).toEqual({
      id: "evt_123",
      object: "event",
      type: "payment_intent.succeeded",
      created: 1_784_000_000,
      livemode: false,
      apiVersion: "2026-06-30.basil",
      pendingWebhooks: 1,
      request: { id: "req_123", idempotencyKey: "idem_123" },
    });
    expect(JSON.stringify(envelope)).not.toContain("buyer@example.test");
    expect(JSON.stringify(envelope)).not.toContain("pi_secret");
    expect(JSON.stringify(envelope)).not.toContain("private");
  });
});
