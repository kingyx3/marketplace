import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

import type { ControlInventoryRow, ControlPurchaseOrderRow } from "@/lib/control-supply";
import {
  filterAndSortInventory,
  getSellableUnits,
  inventoryState,
  isOpenPurchaseOrder,
  purchaseOrderStatusLabel,
} from "@/lib/control-supply-view";

describe("control supply work queue", () => {
  it("finds inventory by recognizable names and every operational identifier", () => {
    const rows = [
      inventory({
        productName: "Pokémon Journey Together Booster Box",
        productId: "product-journey",
        referenceCode: "PKM-JTG-BB-EN",
      }),
      inventory({
        productName: "One Piece Royal Blood Booster Box",
        productId: "product-royal",
        referenceCode: "OP-10-BB-EN",
      }),
    ];

    for (const query of ["journey together", "PKM-JTG-BB-EN", "product-journey"]) {
      expect(
        filterAndSortInventory(rows, { query, filter: "all", sort: "attention" }).map(
          (row) => row.productId
        )
      ).toEqual(["product-journey"]);
    }
  });

  it("surfaces allocation gaps and no-stock records before passive inventory", () => {
    const rows = [
      inventory({ productId: "sellable", available: 12, safetyStock: 2, incoming: 0 }),
      inventory({ productId: "incoming-only", available: 2, safetyStock: 2, incoming: 10 }),
      inventory({ productId: "empty", available: 0, safetyStock: 2, incoming: 0 }),
      inventory({ productId: "allocation-gap", available: -4, safetyStock: 0, incoming: 8 }),
    ];

    expect(
      filterAndSortInventory(rows, { query: "", filter: "all", sort: "attention" }).map(
        (row) => row.productId
      )
    ).toEqual(["allocation-gap", "empty", "incoming-only", "sellable"]);
    expect(
      filterAndSortInventory(rows, { query: "", filter: "attention", sort: "attention" }).map(
        (row) => row.productId
      )
    ).toEqual(["allocation-gap", "empty", "incoming-only"]);
    expect(getSellableUnits(rows[0])).toBe(10);
    expect(inventoryState(rows[3])).toBe("allocated_beyond_on_hand");
  });

  it("uses the actual purchase-order terminal states and keeps system status visible", () => {
    const statuses = ["draft", "submitted", "confirmed", "partially_received"];
    expect(statuses.every((status) => isOpenPurchaseOrder(purchaseOrder(status)))).toBe(true);
    expect(isOpenPurchaseOrder(purchaseOrder("received"))).toBe(false);
    expect(isOpenPurchaseOrder(purchaseOrder("cancelled"))).toBe(false);
    expect(purchaseOrderStatusLabel("partially_received")).toBe("Partially received");
    expect(purchaseOrderStatusLabel("provider_hold")).toBe("Provider Hold");
  });

  it("renders bounded navigation, exact inventory quantities, and labeled identifiers", async () => {
    const [page, supply] = await Promise.all([
      readFile(new URL("../app/(shop)/control/supply/page.tsx", import.meta.url), "utf8"),
      readFile(new URL("../lib/control-supply.ts", import.meta.url), "utf8"),
    ]);

    expect(page).toContain("INVENTORY_PAGE_SIZE = 25");
    expect(page).toContain('aria-label="Active inventory filters"');
    expect(page).toContain("Product ID");
    expect(page).toContain("product ID");
    expect(page).toContain("System status:");
    expect(page).toContain("row.available");
    expect(page).toContain("row.safetyStock");
    expect(page).toContain("getSellableUnits(row)");
    expect(supply).toContain("purchase_order_items(quantity, received_quantity)");
    expect(supply).toContain("updated_at");
  });
});

function inventory(overrides: Partial<ControlInventoryRow> = {}): ControlInventoryRow {
  return {
    productId: "product-default",
    referenceCode: "PRODUCT-DEFAULT",
    productName: "Default product",
    onHand: 12,
    incoming: 0,
    allocated: 0,
    safetyStock: 2,
    available: 12,
    updatedAt: "2026-07-21T00:00:00.000Z",
    ...overrides,
  };
}

function purchaseOrder(status: string): ControlPurchaseOrderRow {
  return {
    id: `po-${status}`,
    status,
    supplier: "Supplier One",
    expectedAt: null,
    orderedUnits: 10,
    receivedUnits: 0,
    valueCents: 1_000,
    currency: "SGD",
  };
}
