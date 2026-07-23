import { describe, expect, it, vi } from "vitest";

import { handleHitPayEvent } from "@/lib/hitpay-webhooks";
import { reconcileOrderPayment } from "@/lib/payment-reconciliation";

vi.mock("@/lib/hitpay-webhooks", () => ({
  handleHitPayEvent: vi.fn(),
}));

const mockedHandleHitPayEvent = vi.mocked(handleHitPayEvent);

describe("order payment reconciliation", () => {
  it("settles a completed provider request when its webhook was missed", async () => {
    const supabase = fakeSupabase({
      provider_payment_id: "11111111-1111-4111-8111-111111111111",
      status: "pending",
    });
    const paymentRequest = {
      id: "11111111-1111-4111-8111-111111111111",
      status: "completed",
      amount: "10.00",
      currency: "SGD",
      url: "https://securecheckout.hit-pay.com/example",
      payments: [
        {
          id: "22222222-2222-4222-8222-222222222222",
          status: "succeeded",
          amount: "10.00",
          currency: "SGD",
        },
      ],
    };
    const hitpay = fakeHitPay(paymentRequest);

    await expect(
      reconcileOrderPayment(supabase as never, "order-1", hitpay as never),
    ).resolves.toBe("completed");

    expect(mockedHandleHitPayEvent).toHaveBeenCalledWith(
      supabase,
      {
        object: "payment_request",
        type: "completed",
        payload: paymentRequest,
      },
      hitpay,
    );
  });

  it("leaves an incomplete provider request pending", async () => {
    const supabase = fakeSupabase({
      provider_payment_id: "11111111-1111-4111-8111-111111111111",
      status: "pending",
    });
    const hitpay = fakeHitPay({
      id: "11111111-1111-4111-8111-111111111111",
      status: "pending",
      amount: "10.00",
      currency: "SGD",
      url: "https://securecheckout.hit-pay.com/example",
    });

    await expect(
      reconcileOrderPayment(supabase as never, "order-1", hitpay as never),
    ).resolves.toBe("unchanged");
    expect(mockedHandleHitPayEvent).not.toHaveBeenCalled();
  });

  it("does not call HitPay when there is no pending payment", async () => {
    const supabase = fakeSupabase(null);
    const hitpay = fakeHitPay(null);

    await expect(
      reconcileOrderPayment(supabase as never, "order-1", hitpay as never),
    ).resolves.toBe("unchanged");
    expect(hitpay.getPaymentRequest).not.toHaveBeenCalled();
  });
});

function fakeSupabase(data: Record<string, unknown> | null) {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    in: vi.fn(() => builder),
    order: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    maybeSingle: vi.fn(async () => ({ data, error: null })),
  };
  return { from: vi.fn(() => builder) };
}

function fakeHitPay(paymentRequest: Record<string, unknown> | null) {
  return {
    getPaymentRequest: vi.fn(async () => paymentRequest),
    createPaymentRequest: vi.fn(),
    cancelPaymentRequest: vi.fn(),
    createRefund: vi.fn(),
  };
}
