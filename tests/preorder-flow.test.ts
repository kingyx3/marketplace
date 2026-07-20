import { access, readFile } from "node:fs/promises";
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

  it("keeps the server allocation query retail-only and fully paid", async () => {
    const source = await readFile(new URL("../lib/preorders.ts", import.meta.url), "utf8");

    expect(source).toContain('.eq("channel", "b2c")');
    expect(source).toContain('.eq("status", "paid")');
    expect(source).toContain('.eq("kind", "full")');
    expect(source).not.toContain('channel: "b2b"');
  });

  it("requires a reviewed allocation fingerprint and explicit confirmation", async () => {
    const [page, action, api] = await Promise.all([
      readFile(
        new URL("../app/(shop)/control/orders/allocations/[skuId]/page.tsx", import.meta.url),
        "utf8"
      ),
      readFile(new URL("../app/actions/preorder-allocation.ts", import.meta.url), "utf8"),
      readFile(new URL("../app/api/admin/preorders/allocate/route.ts", import.meta.url), "utf8"),
    ]);

    expect(page).toContain("Confirm allocation and refunds");
    expect(page).toContain('name="confirm"');
    expect(page).toContain('name="fingerprint"');
    expect(action).toContain('String(formData.get("confirm")');
    expect(action).toContain("executePreorderAllocationForSku");
    expect(api).toContain("preorderAllocationRequestSchema");
    expect(api).toContain("fingerprint: input.fingerprint");
  });

  it("creates idempotent HitPay refunds for allocation shortfalls", async () => {
    const [source, migration] = await Promise.all([
      readFile(new URL("../lib/preorders.ts", import.meta.url), "utf8"),
      readFile(
        new URL(
          "../supabase/migrations/20260718150200_preorder_allocation_refunds.sql",
          import.meta.url
        ),
        "utf8"
      ),
    ]);

    expect(source).toContain("preorder-allocation-refund:");
    expect(source).toContain("amount: row.refund_cents");
    expect(migration).toContain("HitPay refund confirmation required");
    expect(migration).toContain("preorder_allocation_shortfall");
    expect(migration).toContain("allocation preview is stale");
  });

  it("removes the legacy preorder balance collection endpoint", async () => {
    const checkout = await readFile(new URL("../lib/checkout.ts", import.meta.url), "utf8");
    const balanceRoute = new URL("../app/api/preorders/[id]/balance/route.ts", import.meta.url);

    expect(checkout).not.toContain("createPreorderBalancePayment");
    await expect(access(balanceRoute)).rejects.toThrow();
  });
});
