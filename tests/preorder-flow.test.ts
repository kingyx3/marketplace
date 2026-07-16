import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

import { allocate } from "@/lib/allocation";

describe("retail preorder flow", () => {
  it("allocates retail preorders FIFO while respecting customer caps", () => {
    const allocations = allocate(
      5,
      [
        {
          priority: 10,
          channel: "b2c",
          reserveQuantity: 0,
          maxPerCustomer: 2,
        },
      ],
      [
        {
          preorderId: "pre-1",
          customerId: "customer-1",
          channel: "b2c",
          quantity: 3,
          position: 0,
        },
        {
          preorderId: "pre-2",
          customerId: "customer-2",
          channel: "b2c",
          quantity: 2,
          position: 1,
        },
        {
          preorderId: "pre-3",
          customerId: "customer-3",
          channel: "b2c",
          quantity: 2,
          position: 2,
        },
      ]
    );

    expect(allocations).toEqual([
      { preorderId: "pre-1", allocated: 2 },
      { preorderId: "pre-2", allocated: 2 },
      { preorderId: "pre-3", allocated: 1 },
    ]);
  });

  it("does not allocate more than the available quantity", () => {
    const allocations = allocate(
      1,
      [{ priority: 10, channel: "b2c", reserveQuantity: 0, maxPerCustomer: null }],
      [
        {
          preorderId: "pre-1",
          customerId: "customer-1",
          channel: "b2c",
          quantity: 4,
          position: 0,
        },
      ]
    );

    expect(allocations).toEqual([{ preorderId: "pre-1", allocated: 1 }]);
  });

  it("keeps the server allocation query retail-only", async () => {
    const source = await readFile(new URL("../lib/preorders.ts", import.meta.url), "utf8");

    expect(source).toContain('.eq("channel", "b2c")');
    expect(source).not.toContain('channel: "b2b"');
  });

  it("keeps checkout and preorder balance flows free of invoice checkout", async () => {
    const [checkout, orderCheckout] = await Promise.all([
      readFile(new URL("../lib/checkout.ts", import.meta.url), "utf8"),
      readFile(new URL("../lib/order-checkout.ts", import.meta.url), "utf8"),
    ]);

    expect(checkout).not.toContain("manual_invoice");
    expect(checkout).not.toContain("createInvoiceCheckout");
    expect(orderCheckout).not.toContain("manual_invoice");
    expect(orderCheckout).not.toContain("createInvoiceCheckout");
  });
});
