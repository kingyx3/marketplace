import { preorderStatusLabel } from "@/lib/order-display";

export type OrderRecordKind = "order" | "preorder";
export type OrderWorkQueue = "all" | "allocation" | "payment" | "active" | "completed" | "closed";
export type OrderWorkspaceSort = "action" | "updated_desc" | "oldest" | "customer" | "value_desc";

export interface ControlOrderRecord {
  kind: OrderRecordKind;
  id: string;
  status: string;
  customer: { id: string; email: string; name: string | null } | null;
  currency: string;
  totalCents: number;
  quantity: number;
  lineCount: number;
  allocatedQuantity: number | null;
  createdAt: string;
  updatedAt: string;
  products: Array<{ name: string; referenceCode: string | null }>;
  providerReferences: string[];
  linkedOrderId: string | null;
}

export function parseOrderRecordKind(value?: string): "all" | OrderRecordKind {
  return value === "order" || value === "preorder" ? value : "all";
}

export function parseOrderWorkQueue(value?: string): OrderWorkQueue {
  return ["allocation", "payment", "active", "completed", "closed"].includes(value ?? "")
    ? (value as OrderWorkQueue)
    : "all";
}

export function parseOrderWorkspaceSort(value?: string): OrderWorkspaceSort {
  return ["updated_desc", "oldest", "customer", "value_desc"].includes(value ?? "")
    ? (value as OrderWorkspaceSort)
    : "action";
}

export function orderWorkQueue(record: ControlOrderRecord): Exclude<OrderWorkQueue, "all"> {
  if (record.kind === "preorder" && ["paid", "deposited"].includes(record.status)) {
    return "allocation";
  }
  if (
    (record.kind === "order" && ["draft", "pending_payment"].includes(record.status)) ||
    (record.kind === "preorder" &&
      ["pending_payment", "pending_deposit", "balance_due"].includes(record.status))
  ) {
    return "payment";
  }
  if (["cancelled", "refunded"].includes(record.status)) return "closed";
  if (
    (record.kind === "order" && record.status === "delivered") ||
    (record.kind === "preorder" && record.status === "converted")
  ) {
    return "completed";
  }
  return "active";
}

export function orderStatusLabel(record: ControlOrderRecord): string {
  if (record.kind === "preorder") return preorderStatusLabel(record.status);
  return (
    {
      draft: "Draft",
      pending_payment: "Payment required",
      paid: "Paid",
      packing: "Packing",
      shipped: "Shipped",
      delivered: "Delivered",
      cancelled: "Cancelled",
      refunded: "Refunded",
    }[record.status] ?? humanize(record.status)
  );
}

export function orderNextStep(record: ControlOrderRecord): string {
  const queue = orderWorkQueue(record);
  if (queue === "allocation") return "Confirm allocation context";
  if (queue === "payment") return "Review payment state";
  if (queue === "completed") return "Verify completion";
  if (queue === "closed") return "Review history";
  return record.kind === "order" ? "Review order progress" : "Review preorder progress";
}

export function matchesOrderSearch(record: ControlOrderRecord, value: string): boolean {
  const search = value.trim().toLocaleLowerCase("en-SG");
  if (!search) return true;

  return [
    record.id,
    record.linkedOrderId,
    record.customer?.id,
    record.customer?.name,
    record.customer?.email,
    ...record.providerReferences,
    ...record.products.flatMap((product) => [product.name, product.referenceCode]),
  ].some((candidate) => candidate?.toLocaleLowerCase("en-SG").includes(search));
}

export function sortOrderRecords(
  records: ControlOrderRecord[],
  sort: OrderWorkspaceSort
): ControlOrderRecord[] {
  return [...records].sort((left, right) => {
    if (sort === "oldest") return recordTime(left) - recordTime(right);
    if (sort === "customer") {
      return customerLabel(left).localeCompare(customerLabel(right), "en-SG", {
        sensitivity: "base",
      });
    }
    if (sort === "value_desc") return right.totalCents - left.totalCents;
    if (sort === "updated_desc") return recordTime(right) - recordTime(left);

    const priority = { allocation: 0, payment: 1, active: 2, completed: 3, closed: 4 };
    const difference = priority[orderWorkQueue(left)] - priority[orderWorkQueue(right)];
    return difference || recordTime(right) - recordTime(left);
  });
}

function customerLabel(record: ControlOrderRecord): string {
  return record.customer?.name || record.customer?.email || record.id;
}

function recordTime(record: ControlOrderRecord): number {
  return Date.parse(record.updatedAt);
}

function humanize(value: string): string {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
