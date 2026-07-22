import type { ControlInventoryRow, ControlPurchaseOrderRow } from "@/lib/control-supply";

export type InventoryFilter = "all" | "attention" | "sellable" | "incoming";
export type InventorySort = "attention" | "product" | "sellable" | "incoming" | "updated";

export const PURCHASE_ORDER_STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  submitted: "Submitted",
  confirmed: "Confirmed",
  partially_received: "Partially received",
  received: "Received",
  cancelled: "Cancelled",
};

export function getSellableUnits(row: ControlInventoryRow): number {
  return Math.max(0, row.available - row.safetyStock);
}

export function needsInventoryAttention(row: ControlInventoryRow): boolean {
  return getSellableUnits(row) === 0;
}

export function inventoryState(
  row: ControlInventoryRow
): "allocated_beyond_on_hand" | "incoming_only" | "no_sellable_stock" | "sellable" {
  if (row.available < 0) return "allocated_beyond_on_hand";
  if (getSellableUnits(row) > 0) return "sellable";
  if (row.incoming > 0) return "incoming_only";
  return "no_sellable_stock";
}

export function filterAndSortInventory(
  rows: ControlInventoryRow[],
  options: { query: string; filter: InventoryFilter; sort: InventorySort }
): ControlInventoryRow[] {
  const query = normalize(options.query);
  return rows
    .filter((row) => {
      const matchesQuery =
        !query ||
        [row.productName, row.referenceCode, row.productId].some((value) =>
          normalize(value).includes(query)
        );
      const matchesFilter =
        options.filter === "all" ||
        (options.filter === "attention" && needsInventoryAttention(row)) ||
        (options.filter === "sellable" && getSellableUnits(row) > 0) ||
        (options.filter === "incoming" && row.incoming > 0);
      return matchesQuery && matchesFilter;
    })
    .sort((left, right) => compareInventory(left, right, options.sort));
}

export function isOpenPurchaseOrder(order: ControlPurchaseOrderRow): boolean {
  return !["received", "cancelled"].includes(order.status);
}

export function purchaseOrderStatusLabel(status: string): string {
  return PURCHASE_ORDER_STATUS_LABELS[status] ?? humanizeStatus(status);
}

function compareInventory(
  left: ControlInventoryRow,
  right: ControlInventoryRow,
  sort: InventorySort
): number {
  if (sort === "product") return compareNames(left, right);
  if (sort === "sellable") {
    return getSellableUnits(left) - getSellableUnits(right) || compareNames(left, right);
  }
  if (sort === "incoming") {
    return right.incoming - left.incoming || compareNames(left, right);
  }
  if (sort === "updated") {
    return right.updatedAt.localeCompare(left.updatedAt) || compareNames(left, right);
  }
  return inventoryPriority(left) - inventoryPriority(right) || compareNames(left, right);
}

function inventoryPriority(row: ControlInventoryRow): number {
  if (row.available < 0) return 0;
  if (getSellableUnits(row) === 0 && row.incoming === 0) return 1;
  if (getSellableUnits(row) === 0) return 2;
  return 3;
}

function compareNames(left: ControlInventoryRow, right: ControlInventoryRow): number {
  return left.productName.localeCompare(right.productName) || left.referenceCode.localeCompare(right.referenceCode);
}

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase("en-SG");
}

function humanizeStatus(value: string): string {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
