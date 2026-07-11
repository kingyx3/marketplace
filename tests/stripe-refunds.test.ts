import { describe, expect, it, vi } from "vitest";

import { handleStripeEvent } from "@/lib/stripe-webhooks";

describe("Stripe refund accounting", () => {
  it("records each partial refund amount instead of the cumulative charge total", async () => {
    const { supabase, refundRows } = fakeRefundSupabase();

    await handleStripeEvent(
      supabase as never,
      refundedChargeEvent({
        eventId: "evt_refund_1",
        chargeRefunded: false,
        cumulativeRefundedCents: 1000,
        refunds: [refund("re_1", 1000, 100)],
      }) as never
    );

    await handleStripeEvent(
      supabase as never,
      refundedChargeEvent({
        eventId: "evt_refund_2",
        chargeRefunded: false,
        cumulativeRefundedCents: 2000,
        refunds: [refund("re_2", 1000, 200), refund("re_1", 1000, 100)],
      }) as never
    );

    expect(refundRows).toEqual([
      expect.objectContaining({
        provider_refund_id: "re_1",
        amount_cents: 1000,
        status: "succeeded",
      }),
      expect.objectContaining({
        provider_refund_id: "re_2",
        amount_cents: 1000,
        status: "succeeded",
      }),
    ]);
    expect(refundRows.reduce((sum, row) => sum + Number(row.amount_cents), 0)).toBe(2000);
  });
});

function refund(id: string, amount: number, created: number) {
  return {
    id,
    amount,
    created,
    reason: "requested_by_customer",
    status: "succeeded",
  };
}

function refundedChargeEvent(input: {
  eventId: string;
  chargeRefunded: boolean;
  cumulativeRefundedCents: number;
  refunds: unknown[];
}) {
  return {
    id: input.eventId,
    type: "charge.refunded",
    data: {
      object: {
        id: `ch_${input.eventId}`,
        payment_intent: "pi_order",
        amount_refunded: input.cumulativeRefundedCents,
        refunded: input.chargeRefunded,
        refunds: { data: input.refunds },
      },
    },
  };
}

function fakeRefundSupabase() {
  const refundRows: Array<Record<string, unknown>> = [];

  const supabase = {
    from: vi.fn((table: string) => {
      if (table === "payments") {
        const builder = {
          select: vi.fn(() => builder),
          eq: vi.fn(() => builder),
          maybeSingle: vi.fn(async () => ({
            data: {
              id: "payment-1",
              order_id: "order-1",
              preorder_id: null,
              kind: "full",
              status: "captured",
              currency: "SGD",
            },
            error: null,
          })),
        };
        return builder;
      }

      if (table === "refunds") {
        return {
          insert: vi.fn(async (row: Record<string, unknown>) => {
            refundRows.push(row);
            return { error: null };
          }),
        };
      }

      return {
        update: vi.fn(() => ({
          eq: vi.fn(async () => ({ error: null })),
        })),
      };
    }),
  };

  return { supabase, refundRows };
}
