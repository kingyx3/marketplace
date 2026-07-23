import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

import {
  deliveryNextAction,
  deliveryQueueState,
  matchesDeliverySearch,
  parseDeliveryQueueFilter,
  parseDeliveryQueueSort,
  sortDeliveryOrders,
} from "@/lib/control-delivery-view";
import type { AdminDeliveryOrder, DeliveryStatus } from "@/lib/deliveries";

describe("control delivery workspace", () => {
  it("separates delivery exceptions from orders ready to arrange", () => {
    const ready = deliveryOrder();
    const returned = deliveryOrder({ shipmentStatus: "returned" });
    const lost = deliveryOrder({ shipmentStatus: "lost" });

    expect(deliveryQueueState(ready)).toBe("ready");
    expect(deliveryQueueState(returned)).toBe("exceptions");
    expect(deliveryQueueState(lost)).toBe("exceptions");
    expect(deliveryNextAction(returned)).toBe("Review exception");
    expect(deliveryNextAction(ready)).toBe("Arrange delivery");
  });

  it("searches exact operational identifiers and recognizable labels", () => {
    const order = deliveryOrder({ shipmentStatus: "in_transit" });

    for (const search of [
      "order-123",
      "customer-456",
      "alex tan",
      "alex@example.test",
      "shipment-789",
      "ninja van",
      "track-101",
      "booster box",
      "REF-2026",
    ]) {
      expect(matchesDeliverySearch(order, search)).toBe(true);
    }
    expect(matchesDeliverySearch(order, "unrelated")).toBe(false);
  });

  it("puts exceptions and unarranged deliveries before passive records", () => {
    const delivered = deliveryOrder({ id: "delivered", shipmentStatus: "delivered" });
    const ready = deliveryOrder({ id: "ready" });
    const exception = deliveryOrder({ id: "exception", shipmentStatus: "lost" });

    expect(
      sortDeliveryOrders([delivered, ready, exception], "action").map((row) => row.id)
    ).toEqual(["exception", "ready", "delivered"]);
    expect(parseDeliveryQueueFilter("returned")).toBe("all");
    expect(parseDeliveryQueueFilter("exceptions")).toBe("exceptions");
    expect(parseDeliveryQueueSort("unknown")).toBe("action");
  });

  it("ships visible filters, bounded pagination, and labeled identifiers", async () => {
    const source = await readFile(
      new URL("../app/(shop)/control/fulfilment/deliveries/page.tsx", import.meta.url),
      "utf8"
    );

    expect(source).toContain('aria-label="Active delivery filters"');
    expect(source).toContain('name="q"');
    expect(source).toContain('name="status"');
    expect(source).toContain('name="sort"');
    expect(source).toContain("const PAGE_SIZE = 24");
    expect(source).toContain("matchingOrders.slice");
    expect(source).toContain("100-record maximum reached");
    expect(source).toContain('label="Order ID"');
    expect(source).toContain('label="Customer ID"');
    expect(source).toContain('label="Shipment ID"');
    expect(source).toContain('label="Tracking number"');
    expect(source).toContain("System:");
  });

  it("shows operational detail to viewers while keeping mutations manage-only", async () => {
    const [detail, editor] = await Promise.all([
      readFile(
        new URL("../app/(shop)/control/fulfilment/deliveries/[orderId]/page.tsx", import.meta.url),
        "utf8"
      ),
      readFile(
        new URL("../app/(shop)/control/_components/delivery-editor.tsx", import.meta.url),
        "utf8"
      ),
    ]);

    expect(detail).toContain("<DeliveryEditor");
    expect(detail).toContain('canManage={hasControlPermission(staff, "fulfilment.manage")}');
    expect(editor).toContain("canManage && order.status");
    expect(editor).toContain("canManage && canArrange");
    expect(editor).toContain("canManage && shipment");
    expect(editor).toContain('label="System status"');
    expect(editor).toContain('label="Shipment ID"');
    expect(editor).toContain('label="Tracking number"');
  });
});

function deliveryOrder({
  id = "order-123",
  shipmentStatus,
}: {
  id?: string;
  shipmentStatus?: DeliveryStatus;
} = {}): AdminDeliveryOrder {
  const shipment = shipmentStatus
    ? {
        id: "shipment-789",
        carrier: "Ninja Van",
        trackingNumber: "TRACK-101",
        status: shipmentStatus,
        shippedAt: null,
        deliveredAt: null,
        createdAt: "2026-07-22T00:00:00.000Z",
        updatedAt: "2026-07-22T01:00:00.000Z",
      }
    : null;
  return {
    id,
    status: "paid",
    currency: "SGD",
    totalCents: 12_000,
    capturedCents: 12_000,
    shippingAddress: null,
    shippingService: null,
    placedAt: "2026-07-22T00:00:00.000Z",
    createdAt: "2026-07-22T00:00:00.000Z",
    updatedAt: "2026-07-22T01:00:00.000Z",
    customer: { id: "customer-456", email: "alex@example.test", name: "Alex Tan" },
    items: [
      {
        id: "item-1",
        quantity: 2,
        productName: "Booster Box",
        referenceCode: "REF-2026",
      },
    ],
    shipments: shipment ? [shipment] : [],
    latestShipment: shipment,
  };
}
