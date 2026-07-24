import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

import {
  matchesOrderSearch,
  orderNextStep,
  orderStatusLabel,
  orderWorkQueue,
  parseOrderRecordKind,
  parseOrderWorkspaceSort,
  parseOrderWorkQueue,
  sortOrderRecords,
  type ControlOrderRecord,
} from "@/lib/control-order-view";

describe("control order workspace", () => {
  it("separates allocation and payment work from passive history", () => {
    const allocation = record({ kind: "preorder", status: "paid" });
    const payment = record({ kind: "order", status: "pending_payment" });
    const complete = record({ kind: "order", status: "delivered" });

    expect(orderWorkQueue(allocation)).toBe("allocation");
    expect(orderWorkQueue(payment)).toBe("payment");
    expect(orderWorkQueue(complete)).toBe("completed");
    expect(orderNextStep(allocation)).toBe("Confirm allocation context");
    expect(orderStatusLabel(payment)).toBe("Payment required");
  });

  it("searches recognizable labels and exact operational references", () => {
    const candidate = record();
    for (const search of [
      "record-123",
      "customer-456",
      "alex tan",
      "alex@example.test",
      "booster box",
      "REF-2026",
      "hitpay-789",
      "linked-order-101",
    ]) {
      expect(matchesOrderSearch(candidate, search)).toBe(true);
    }
    expect(matchesOrderSearch(candidate, "unrelated")).toBe(false);
  });

  it("sorts allocation and payment work ahead of completed records", () => {
    const complete = record({ id: "complete", kind: "order", status: "delivered" });
    const payment = record({ id: "payment", kind: "order", status: "pending_payment" });
    const allocation = record({ id: "allocation", kind: "preorder", status: "paid" });

    expect(
      sortOrderRecords([complete, payment, allocation], "action").map((row) => row.id)
    ).toEqual(["allocation", "payment", "complete"]);
    expect(parseOrderRecordKind("unknown")).toBe("all");
    expect(parseOrderWorkQueue("allocation")).toBe("allocation");
    expect(parseOrderWorkspaceSort("unknown")).toBe("action");
  });

  it("ships visible filters, bounded pagination, and labeled identifiers", async () => {
    const source = await readFile(
      new URL("../app/(shop)/control/orders/page.tsx", import.meta.url),
      "utf8"
    );

    expect(source).toContain('aria-label="Active order filters"');
    expect(source).toContain('name="q"');
    expect(source).toContain('name="type"');
    expect(source).toContain('name="queue"');
    expect(source).toContain('name="sort"');
    expect(source).toContain("const PAGE_SIZE = 24");
    expect(source).toContain("const SOURCE_LIMIT = 100");
    expect(source).toContain("matchingRecords.slice");
    expect(source).toContain('"Order ID" : "Preorder ID"');
    expect(source).toContain('label="Customer ID"');
    expect(source).toContain('label="Provider reference"');
    expect(source).toContain("System:");
  });

  it("keeps allocation navigation permission-aware and all mutations off the list", async () => {
    const source = await readFile(
      new URL("../app/(shop)/control/orders/page.tsx", import.meta.url),
      "utf8"
    );
    expect(source).toContain('hasControlPermission(staff, "preorders.allocate")');
    expect(source).toContain('hasControlPermission(staff, "refunds.manage")');
    expect(source).not.toContain("runAdminOrderAction");
    expect(source).not.toContain("confirmPreorderAllocation");
  });
});

function record(overrides: Partial<ControlOrderRecord> = {}): ControlOrderRecord {
  return {
    kind: "preorder",
    id: "record-123",
    status: "deposited",
    customer: { id: "customer-456", email: "alex@example.test", name: "Alex Tan" },
    currency: "SGD",
    totalCents: 12_000,
    quantity: 2,
    lineCount: 1,
    allocatedQuantity: 0,
    createdAt: "2026-07-23T00:00:00.000Z",
    updatedAt: "2026-07-23T01:00:00.000Z",
    products: [{ name: "Booster Box", referenceCode: "REF-2026" }],
    providerReferences: ["hitpay-789"],
    linkedOrderId: "linked-order-101",
    ...overrides,
  };
}
