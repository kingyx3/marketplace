import { describe, expect, it } from "vitest";
import {
  bestDiscountBpsForSubtotal,
  discountedPriceCents,
  formatDiscountBps,
  maxDiscountBps,
  minimumOrderCents,
  wholesaleIsActive,
  type WholesaleAccess,
} from "@/lib/b2b";

const wholesaleAccess: WholesaleAccess = {
  status: "approved",
  companyName: "Example Games",
  tiers: [
    {
      id: "tier-1",
      code: "wholesale_1",
      name: "Wholesale Tier 1",
      discountBps: 800,
      minOrderCents: 50000,
    },
    {
      id: "tier-2",
      code: "wholesale_2",
      name: "Wholesale Tier 2",
      discountBps: 1200,
      minOrderCents: 200000,
    },
  ],
};

describe("B2B pricing helpers", () => {
  it("requires both approval and an assigned tier before wholesale checkout is active", () => {
    expect(wholesaleIsActive(wholesaleAccess)).toBe(true);
    expect(wholesaleIsActive({ ...wholesaleAccess, tiers: [] })).toBe(false);
    expect(wholesaleIsActive({ ...wholesaleAccess, status: "pending" })).toBe(false);
    expect(wholesaleIsActive(null)).toBe(false);
  });

  it("selects the best eligible discount for the current subtotal", () => {
    expect(minimumOrderCents(wholesaleAccess.tiers)).toBe(50000);
    expect(maxDiscountBps(wholesaleAccess.tiers)).toBe(1200);
    expect(bestDiscountBpsForSubtotal(wholesaleAccess.tiers, 49999)).toBe(0);
    expect(bestDiscountBpsForSubtotal(wholesaleAccess.tiers, 50000)).toBe(800);
    expect(bestDiscountBpsForSubtotal(wholesaleAccess.tiers, 250000)).toBe(1200);
  });

  it("formats and applies basis-point discounts in integer cents", () => {
    expect(discountedPriceCents(19900, 800)).toBe(18308);
    expect(formatDiscountBps(800)).toBe("8%");
    expect(formatDiscountBps(875)).toBe("8.75%");
  });
});
