import { describe, expect, it } from "vitest";
import {
  calculateDepositCents,
  calculateDiscountCents,
  normalizeCartItems,
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

  it("uses a bounded non-zero preorder deposit", () => {
    expect(calculateDepositCents(19900)).toBe(3980);
    expect(calculateDepositCents(1)).toBe(100);
    expect(calculateDepositCents(0)).toBe(0);
  });
});

