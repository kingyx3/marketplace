import { describe, expect, it } from "vitest";
import { payNowPaymentIntentParams } from "@/lib/stripe";

describe("Stripe PayNow payment policy", () => {
  it("forces PayNow and removes incompatible reusable or manual-capture options", () => {
    const result = payNowPaymentIntentParams({
      amount: 19900,
      currency: "SGD",
      automatic_payment_methods: { enabled: true },
      capture_method: "manual",
      setup_future_usage: "off_session",
      payment_method_types: ["card"],
      metadata: { order_id: "order-123" },
    });

    expect(result).toMatchObject({
      amount: 19900,
      currency: "sgd",
      payment_method_types: ["paynow"],
      metadata: { order_id: "order-123" },
    });
    expect(result).not.toHaveProperty("automatic_payment_methods");
    expect(result).not.toHaveProperty("capture_method");
    expect(result).not.toHaveProperty("setup_future_usage");
  });

  it("rejects non-SGD PaymentIntents", () => {
    expect(() =>
      payNowPaymentIntentParams({
        amount: 19900,
        currency: "usd",
      })
    ).toThrow("PayNow payments require SGD");
  });
});
