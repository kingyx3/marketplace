export type StorefrontSetStatus =
  "announced" | "preorder_open" | "preorder_closed" | "released" | "out_of_print";

export type StorefrontAvailabilityKind =
  | "in_stock"
  | "low_stock"
  | "out_of_stock"
  | "preorder_available"
  | "preorder_sold_out"
  | "coming_soon"
  | "preorder_closed"
  | "out_of_print";

export interface StorefrontInventorySnapshot {
  setStatus: StorefrontSetStatus;
  onHand: number;
  incoming: number;
  allocated: number;
  safetyStock: number;
}

export interface StorefrontAvailability {
  available: number;
  kind: StorefrontAvailabilityKind;
  label: string;
  mode: "order" | "preorder" | null;
  purchasable: boolean;
  showWaitlist: boolean;
}

const LOW_STOCK_THRESHOLD = 5;

export function getStorefrontAvailability(
  inventory: StorefrontInventorySnapshot
): StorefrontAvailability {
  const physicalAvailable = Math.max(
    0,
    inventory.onHand - inventory.allocated - inventory.safetyStock
  );
  const preorderAvailable = Math.max(
    0,
    inventory.onHand + inventory.incoming - inventory.allocated - inventory.safetyStock
  );

  if (inventory.setStatus === "announced") {
    return unavailable("coming_soon", "Coming soon", true);
  }

  if (inventory.setStatus === "preorder_closed") {
    return unavailable("preorder_closed", "Preorder closed", true);
  }

  if (inventory.setStatus === "out_of_print") {
    return unavailable("out_of_print", "Out of print", false);
  }

  if (inventory.setStatus === "preorder_open") {
    if (preorderAvailable <= 0) {
      return unavailable("preorder_sold_out", "Preorder sold out", true);
    }

    return {
      available: preorderAvailable,
      kind: "preorder_available",
      label:
        preorderAvailable <= LOW_STOCK_THRESHOLD
          ? `Only ${preorderAvailable} preorder${preorderAvailable === 1 ? "" : "s"} left`
          : "Preorder available",
      mode: "preorder",
      purchasable: true,
      showWaitlist: false,
    };
  }

  if (physicalAvailable <= 0) {
    return unavailable("out_of_stock", "Out of stock", true);
  }

  if (physicalAvailable <= LOW_STOCK_THRESHOLD) {
    return {
      available: physicalAvailable,
      kind: "low_stock",
      label: `Only ${physicalAvailable} left`,
      mode: "order",
      purchasable: true,
      showWaitlist: false,
    };
  }

  return {
    available: physicalAvailable,
    kind: "in_stock",
    label: "In stock",
    mode: "order",
    purchasable: true,
    showWaitlist: false,
  };
}

function unavailable(
  kind: Extract<
    StorefrontAvailabilityKind,
    "out_of_stock" | "preorder_sold_out" | "coming_soon" | "preorder_closed" | "out_of_print"
  >,
  label: string,
  showWaitlist: boolean
): StorefrontAvailability {
  return {
    available: 0,
    kind,
    label,
    mode: null,
    purchasable: false,
    showWaitlist,
  };
}
