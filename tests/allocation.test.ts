import { describe, expect, it } from "vitest";

import { allocate, type AllocationRule, type PendingPreorder } from "@/lib/allocation";

const rules: AllocationRule[] = [
  { priority: 10, channel: "b2c", reserveQuantity: 0, maxPerCustomer: 2 },
];

function preorder(
  id: string,
  quantity: number,
  position: number,
  customerId = id
): PendingPreorder {
  return { preorderId: id, customerId, channel: "b2c", quantity, position };
}

describe("allocate", () => {
  it("fills retail preorders in FIFO order", () => {
    const result = allocate(5, rules, [
      preorder("c1", 2, 1),
      preorder("c2", 2, 2),
      preorder("c3", 2, 3),
    ]);

    expect(result).toEqual([
      { preorderId: "c1", allocated: 2 },
      { preorderId: "c2", allocated: 2 },
      { preorderId: "c3", allocated: 1 },
    ]);
  });

  it("enforces max_per_customer across multiple preorders", () => {
    const result = allocate(10, rules, [
      preorder("a1", 2, 1, "cust-a"),
      preorder("a2", 2, 2, "cust-a"),
    ]);

    expect(result.reduce((sum, allocation) => sum + allocation.allocated, 0)).toBe(2);
  });

  it("never over-allocates when demand exceeds supply", () => {
    const result = allocate(3, rules, [
      preorder("c1", 2, 1),
      preorder("c2", 2, 2),
      preorder("c3", 50, 3),
    ]);

    expect(result.reduce((sum, allocation) => sum + allocation.allocated, 0)).toBe(3);
  });

  it("allows partial fills in FIFO order", () => {
    const result = allocate(3, rules, [preorder("c1", 2, 1), preorder("c2", 2, 2)]);

    expect(result).toEqual([
      { preorderId: "c1", allocated: 2 },
      { preorderId: "c2", allocated: 1 },
    ]);
  });

  it("returns empty when nothing is available", () => {
    expect(allocate(0, rules, [preorder("c1", 2, 1)])).toEqual([]);
  });
});
