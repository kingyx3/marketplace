import { describe, expect, it } from "vitest";
import { checkoutOrderRpcParams } from "@/lib/checkout";
import {
  calculateDepositCents,
  calculateDiscountCents,
  normalizeCartItems,
  type CheckoutQuote,
} from "@/lib/commerce";

describe("commerce helpers", () => {
  it("merges duplicate cart lines without changing first-seen ordering", () => {
    const items = normalizeCartItems([
      { skuId: "sku-a", quantity: 1 },
      { skuId: "sku-b", quantity: 2 },
      { skuId: "sku-a", quantity: 3 },
    ]);

    expect(items).toEqual([
      { skuId: "sku-a", quantity: 4, position: 0 },
      { skuId: "sku-b", quantity: 2, position: 1 },
    ]);
  });

  it("calculates integer-cent discounts", () => {
    expect(calculateDiscountCents(19900, 800)).toBe(1592);
    expect(calculateDiscountCents(19900, 0)).toBe(0);
  });

  it("rejects carts over the database checkout quantity limit", () => {
    expect(() =>
      normalizeCartItems([
        { skuId: "sku-a", quantity: 13 },
        { skuId: "sku-b", quantity: 12 },
      ])
    ).toThrow("Cart quantity exceeds 24");
  });

  it("uses a bounded non-zero preorder deposit", () => {
    expect(calculateDepositCents(19900)).toBe(3980);
    expect(calculateDepositCents(1)).toBe(100);
    expect(calculateDepositCents(0)).toBe(0);
  });

  it("passes server-derived pricing into the checkout order RPC", () => {
    const quote: CheckoutQuote = {
      mode: "order",
      channel: "b2b",
      currency: "SGD",
      lines: [
        {
          skuId: "11111111-1111-4111-8111-111111111111",
          sku: "BOX-1",
          productName: "Booster Box",
          quantity: 2,
          unitPriceCents: 19900,
          lineTotalCents: 39800,
          currency: "SGD",
          availableToSell: 4,
        },
      ],
      subtotalCents: 39800,
      discountBps: 800,
      discountCents: 3184,
      totalCents: 36616,
      depositCents: 36616,
      balanceCents: 0,
    };

    expect(checkoutOrderRpcParams("user-123", quote)).toEqual({
      p_auth_user_id: "user-123",
      p_items: [{ sku_id: "11111111-1111-4111-8111-111111111111", quantity: 2 }],
      p_channel: "b2b",
      p_expected_subtotal_cents: 39800,
      p_discount_cents: 3184,
      p_discount_bps: 800,
      p_expected_total_cents: 36616,
    });
  });
});

