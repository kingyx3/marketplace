import { describe, expect, it, vi } from "vitest";

import { handleHitPayEvent } from "@/lib/hitpay-webhooks";

describe("HitPay webhook processing", () => {
  it("normalizes event names and retries completion until its payment exists", async () => {
    const supabase = missingPaymentSupabase();

    await expect(
      handleHitPayEvent(
        supabase as never,
        {
          object: " PAYMENT_REQUEST ",
          type: " COMPLETED ",
          payload: {
            id: "11111111-1111-4111-8111-111111111111",
            status: "completed",
          },
        },
        fakeHitPay() as never,
      ),
    ).rejects.toThrow("payment is not persisted yet");
  });

  it("does not silently complete unsupported subscribed events", async () => {
    await expect(
      handleHitPayEvent(
        {} as never,
        {
          object: "invoice",
          type: "completed",
          payload: {},
        },
        fakeHitPay() as never,
      ),
    ).rejects.toThrow("Unsupported HitPay webhook event");
  });
});

function missingPaymentSupabase() {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    maybeSingle: vi.fn(async () => ({ data: null, error: null })),
  };
  return { from: vi.fn(() => builder) };
}

function fakeHitPay() {
  return {
    createPaymentRequest: vi.fn(),
    getPaymentRequest: vi.fn(),
    cancelPaymentRequest: vi.fn(),
    createRefund: vi.fn(),
  };
}
