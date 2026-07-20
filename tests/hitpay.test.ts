import { createHmac } from "node:crypto";

import { afterEach, describe, expect, it, vi } from "vitest";

import { hitPayEventAuditEnvelope, validSignature } from "@/app/api/webhooks/hitpay/route";
import {
  createHitPayClient,
  hitPayAmountToCents,
  hitPayPaymentMethods,
  successfulHitPayChargeId,
} from "@/lib/hitpay";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("HitPay payment requests", () => {
  it("uses the configured online payment methods", () => {
    expect(
      hitPayPaymentMethods({ HITPAY_PAYMENT_METHODS: "paynow_online,card" } as NodeJS.ProcessEnv)
    ).toEqual(["paynow_online", "card"]);
  });

  it("converts provider decimal amounts to integer cents", () => {
    expect(hitPayAmountToCents("12.34")).toBe(1234);
  });

  it("extracts the successful charge id for refunds", () => {
    expect(
      successfulHitPayChargeId({
        payments: [
          {
            id: "11111111-1111-4111-8111-111111111111",
            status: "failed",
            amount: "10.00",
            currency: "SGD",
          },
          {
            id: "22222222-2222-4222-8222-222222222222",
            status: "succeeded",
            amount: "10.00",
            currency: "SGD",
          },
        ],
      })
    ).toBe("22222222-2222-4222-8222-222222222222");
  });

  it("creates a hosted payment request using only server-side credentials", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "33333333-3333-4333-8333-333333333333",
          status: "pending",
          amount: "10.00",
          currency: "SGD",
          url: "https://securecheckout.sandbox.hit-pay.com/example",
        }),
        { status: 200 }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const client = createHitPayClient({
      HITPAY_API_KEY: "server-secret",
      HITPAY_API_URL: "https://api.sandbox.hit-pay.com",
      HITPAY_PAYMENT_METHODS: "paynow_online",
    } as NodeJS.ProcessEnv);
    const result = await client.createPaymentRequest({
      amountCents: 1000,
      currency: "SGD",
      purpose: "Order",
      referenceNumber: "order:1",
      redirectUrl: "https://shop.example/cart",
    });

    expect(result.url).toContain("securecheckout.sandbox.hit-pay.com");
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)["X-BUSINESS-API-KEY"]).toBe("server-secret");
    expect(JSON.parse(String(init.body))).toEqual(
      expect.objectContaining({
        amount: "10.00",
        currency: "SGD",
        payment_methods: ["paynow_online"],
        allow_repeated_payments: false,
      })
    );
  });
});

describe("HitPay signed webhooks", () => {
  it("validates HMAC-SHA256 against the unchanged raw body", () => {
    const body = JSON.stringify({ id: "payment-request", status: "completed" });
    const signature = createHmac("sha256", "salt").update(body).digest("hex");
    expect(validSignature(body, signature, "salt")).toBe(true);
    expect(validSignature(`${body} `, signature, "salt")).toBe(false);
  });

  it("stores a privacy-safe audit envelope", () => {
    const envelope = hitPayEventAuditEnvelope({
      object: "payment_request",
      type: "completed",
      payload: {
        id: "44444444-4444-4444-8444-444444444444",
        status: "completed",
        amount: "10.00",
        currency: "SGD",
        reference_number: "order:1",
        email: "buyer@example.com",
        name: "Buyer",
        payments: [{ card: { last4: "4242" } }],
      },
    });

    expect(envelope).toEqual({
      id: "44444444-4444-4444-8444-444444444444",
      object: "payment_request",
      type: "completed",
      status: "completed",
      amount: "10.00",
      currency: "SGD",
      referenceNumber: "order:1",
    });
    expect(envelope).not.toHaveProperty("email");
    expect(envelope).not.toHaveProperty("payments");
  });
});
