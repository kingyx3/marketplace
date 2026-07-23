import type { AdminDeliveryOrder } from "@/lib/deliveries";

export type DeliveryQueueFilter =
  "all" | "exceptions" | "ready" | "arranged" | "in_transit" | "delivered";

export type DeliveryQueueSort = "action" | "updated_desc" | "oldest" | "customer";

export function parseDeliveryQueueFilter(value?: string): DeliveryQueueFilter {
  return ["exceptions", "ready", "arranged", "in_transit", "delivered"].includes(value ?? "")
    ? (value as DeliveryQueueFilter)
    : "all";
}

export function parseDeliveryQueueSort(value?: string): DeliveryQueueSort {
  return ["updated_desc", "oldest", "customer"].includes(value ?? "")
    ? (value as DeliveryQueueSort)
    : "action";
}

export function deliveryQueueState(order: AdminDeliveryOrder): Exclude<DeliveryQueueFilter, "all"> {
  const status = order.latestShipment?.status;
  if (status === "returned" || status === "lost") return "exceptions";
  if (!status) return "ready";
  if (status === "pending" || status === "label_created") return "arranged";
  if (status === "in_transit") return "in_transit";
  return "delivered";
}

export function deliveryNextAction(order: AdminDeliveryOrder): string {
  const state = deliveryQueueState(order);
  if (state === "exceptions") return "Review exception";
  if (state === "ready") return "Arrange delivery";
  if (state === "arranged") return "Update arrangement";
  if (state === "in_transit") return "Update progress";
  return "Verify delivery";
}

export function matchesDeliverySearch(order: AdminDeliveryOrder, value: string): boolean {
  const search = value.trim().toLocaleLowerCase("en-SG");
  if (!search) return true;

  return [
    order.id,
    order.customer?.id,
    order.customer?.name,
    order.customer?.email,
    order.latestShipment?.id,
    order.latestShipment?.carrier,
    order.latestShipment?.trackingNumber,
    ...order.items.flatMap((item) => [item.productName, item.referenceCode]),
  ].some((candidate) => candidate?.toLocaleLowerCase("en-SG").includes(search));
}

export function sortDeliveryOrders(
  orders: AdminDeliveryOrder[],
  sort: DeliveryQueueSort
): AdminDeliveryOrder[] {
  return [...orders].sort((left, right) => {
    if (sort === "oldest") return orderTime(left) - orderTime(right);
    if (sort === "customer") {
      return customerLabel(left).localeCompare(customerLabel(right), "en-SG", {
        sensitivity: "base",
      });
    }
    if (sort === "updated_desc") return orderTime(right) - orderTime(left);

    const priority = { exceptions: 0, ready: 1, arranged: 2, in_transit: 3, delivered: 4 };
    const priorityDifference =
      priority[deliveryQueueState(left)] - priority[deliveryQueueState(right)];
    return priorityDifference || orderTime(right) - orderTime(left);
  });
}

function customerLabel(order: AdminDeliveryOrder): string {
  return order.customer?.name || order.customer?.email || order.id;
}

function orderTime(order: AdminDeliveryOrder): number {
  return Date.parse(order.latestShipment?.updatedAt ?? order.updatedAt);
}
