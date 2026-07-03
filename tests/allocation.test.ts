import { describe, it, expect } from "vitest";
import { allocate, type AllocationRule, type PendingPreorder } from "@/lib/allocation";

const rules: AllocationRule[] = [
  { priority: 10, channel: "b2c", reserveQuantity: 8, maxPerCustomer: 2 },
  { priority: 20, channel: "b2b", reserveQuantity: 0, maxPerCustomer: null },
];

function po(
  id: string,
  channel: "b2c" | "b2b",
  quantity: number,
  position: number,
  customerId = id
): PendingPreorder {
  return { preorderId: id, customerId, channel, quantity, position };
}

describe("allocate", () => {
  it("fills B2C reserve first, then B2B FIFO", () => {
    const result = allocate(
      24,
      rules,
      [po("c1", "b2c", 2, 1), po("c2", "b2c", 2, 2), po("w1", "b2b", 30, 3)]
    );
    expect(result).toEqual([
      { preorderId: "c1", allocated: 2 },
      { preorderId: "c2", allocated: 2 },
      { preorderId: "w1", allocated: 20 },
    ]);
  });

  it("enforces max_per_customer across multiple pre-orders", () => {
    const result = allocate(
      10,
      rules,
      [po("a1", "b2c", 2, 1, "cust-a"), po("a2", "b2c", 2, 2, "cust-a")]
    );
    const total = result.reduce((sum, r) => sum + r.allocated, 0);
    expect(total).toBe(2); // capped at 2 for cust-a regardless of pre-order count
  });

  it("never over-allocates when demand exceeds supply", () => {
    const result = allocate(
      3,
      rules,
      [po("c1", "b2c", 2, 1), po("c2", "b2c", 2, 2), po("w1", "b2b", 50, 3)]
    );
    const total = result.reduce((sum, r) => sum + r.allocated, 0);
    expect(total).toBe(3);
  });

  it("allows partial fills in FIFO order", () => {
    const result = allocate(3, rules, [po("c1", "b2c", 2, 1), po("c2", "b2c", 2, 2)]);
    expect(result).toEqual([
      { preorderId: "c1", allocated: 2 },
      { preorderId: "c2", allocated: 1 },
    ]);
  });

  it("returns empty when nothing is available", () => {
    expect(allocate(0, rules, [po("c1", "b2c", 2, 1)])).toEqual([]);
  });
});
