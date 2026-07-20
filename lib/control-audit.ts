export type AuditArea = "all" | "catalog" | "inventory" | "commerce" | "customers" | "access";

export interface AuditRecordData {
  tableName: string;
  oldData: Record<string, unknown> | null;
  newData: Record<string, unknown> | null;
}

export interface AuditChange {
  label: string;
  value: string;
}

export const AUDIT_PAGE_SIZE = 50;

export const AUDIT_AREAS: ReadonlyArray<{ value: AuditArea; label: string }> = [
  { value: "all", label: "All areas" },
  { value: "catalog", label: "Catalog and storefront" },
  { value: "inventory", label: "Inventory and purchasing" },
  { value: "commerce", label: "Orders, payments, and delivery" },
  { value: "customers", label: "Customers" },
  { value: "access", label: "Administrator access" },
];

export const AUDIT_SEARCH_DATA_KEYS = [
  "name",
  "title",
  "title_override",
  "email",
  "sku",
  "code",
  "slug",
  "key",
  "order_number",
  "provider_payment_id",
  "payment_reference",
  "provider_reference",
  "tracking_number",
] as const;

const AREA_TABLES: Record<Exclude<AuditArea, "all">, string[]> = {
  catalog: [
    "products",
    "product_variants",
    "booster_box_skus",
    "product_types",
    "tcg_categories",
    "sets_releases",
    "listing_items",
    "storefront_configurations",
    "limited_time_deals",
  ],
  inventory: [
    "inventory",
    "suppliers",
    "purchase_orders",
    "purchase_order_items",
    "allocation_rules",
  ],
  commerce: [
    "orders",
    "order_items",
    "preorders",
    "payments",
    "refunds",
    "payment_exceptions",
    "webhook_events",
    "shipments",
  ],
  customers: ["customers", "notifications", "waitlist_entries"],
  access: ["staff_users", "admin_access_grants"],
};

const TABLE_LABELS: Record<string, string> = {
  admin_access_grants: "Administrator grant",
  allocation_rules: "Allocation rule",
  booster_box_skus: "SKU",
  customers: "Customer",
  inventory: "Inventory record",
  limited_time_deals: "Deal",
  listing_items: "Storefront listing",
  notifications: "Notification",
  order_items: "Order item",
  orders: "Order",
  payment_exceptions: "Payment exception",
  payments: "Payment",
  product_types: "Product type",
  product_variants: "Product variant",
  products: "Product",
  purchase_order_items: "Purchase order item",
  purchase_orders: "Purchase order",
  refunds: "Refund",
  sets_releases: "Set",
  shipments: "Delivery",
  staff_users: "Administrator",
  storefront_configurations: "Storefront configuration",
  suppliers: "Supplier",
  tcg_categories: "Category",
  waitlist_entries: "Waitlist entry",
  webhook_events: "Webhook event",
};

const ACTION_LABELS: Record<string, string> = {
  ADMIN_ALLOCATE_PREORDER: "Preorder allocated",
  ADMIN_ARRANGE_DELIVERY: "Delivery arranged",
  ADMIN_CANCEL_UNPAID_ORDER: "Unpaid order cancelled",
  ADMIN_FINALIZE_PREORDER_ALLOCATION: "Preorder allocation finalized",
  ADMIN_INVENTORY_ADJUSTMENT: "Inventory adjusted",
  ADMIN_LIMITED_TIME_DEAL_STATUS: "Deal status changed",
  ADMIN_LIMITED_TIME_DEAL_UPSERT: "Deal saved",
  ADMIN_LISTING_ITEM_CREATE: "Storefront listing created",
  ADMIN_LISTING_ITEM_UPDATE: "Storefront listing updated",
  ADMIN_MANUAL_RECONCILIATION: "Payment manually reconciled",
  ADMIN_MARK_PACKING: "Order marked for packing",
  ADMIN_PRODUCT_ARCHIVE: "Product archived",
  ADMIN_PRODUCT_CREATE: "Product created",
  ADMIN_PRODUCT_IMAGE_SET: "Product image changed",
  ADMIN_PRODUCT_RESTORE: "Product restored",
  ADMIN_PRODUCT_UPDATE: "Product updated",
  ADMIN_SHIP_ORDER: "Order marked shipped",
  ADMIN_SKU_ARCHIVE: "SKU archived",
  ADMIN_SKU_CREATE: "SKU created",
  ADMIN_SKU_RESTORE: "SKU restored",
  ADMIN_SKU_UPDATE: "SKU updated",
  ADMIN_STAGE_PREORDER_ALLOCATION: "Preorder allocation staged",
  ADMIN_STOREFRONT_CONFIG_CREATE: "Storefront configuration created",
  ADMIN_STOREFRONT_CONFIG_UPDATE: "Storefront configuration updated",
  ADMIN_SUPPLIER_PO_INTAKE: "Purchase order recorded",
  ADMIN_UPDATE_DELIVERY_STATUS: "Delivery status updated",
  CONTROL_ADMIN_GRANT_UPDATE: "Administrator access updated",
  CONTROL_ADMIN_GRANT_UPSERT: "Administrator access granted",
  CONTROL_CATEGORY_ARCHIVE: "Category archived",
  CONTROL_CATEGORY_CREATE: "Category created",
  CONTROL_CATEGORY_CREATE_INLINE: "Category created",
  CONTROL_CATEGORY_RESTORE: "Category restored",
  CONTROL_CATEGORY_UPDATE: "Category updated",
  CONTROL_CUSTOMER_DISABLE: "Customer access disabled",
  CONTROL_CUSTOMER_RESTORE: "Customer access restored",
  CONTROL_PRODUCT_CREATE: "Product created",
  CONTROL_PRODUCT_TYPE_CREATE_INLINE: "Product type created",
  CONTROL_SET_ARCHIVE: "Set archived",
  CONTROL_SET_CREATE: "Set created",
  CONTROL_SET_CREATE_INLINE: "Set created",
  CONTROL_SET_RESTORE: "Set restored",
  CONTROL_SET_UPDATE: "Set updated",
  CONTROL_SUPPLIER_ARCHIVE: "Supplier archived",
  CONTROL_SUPPLIER_CREATE: "Supplier created",
  CONTROL_SUPPLIER_RESTORE: "Supplier restored",
  CONTROL_SUPPLIER_UPDATE: "Supplier updated",
};

const TARGET_NAME_KEYS = [
  "name",
  "title",
  "title_override",
  "email",
  "sku",
  "code",
  "label",
  "key",
  "order_number",
  "provider_payment_id",
  "payment_reference",
  "provider_reference",
] as const;

const SAFE_CHANGE_FIELDS: ReadonlyArray<{ key: string; label: string }> = [
  { key: "name", label: "Name" },
  { key: "title", label: "Title" },
  { key: "title_override", label: "Title override" },
  { key: "email", label: "Email" },
  { key: "sku", label: "SKU" },
  { key: "code", label: "Code" },
  { key: "slug", label: "Slug" },
  { key: "key", label: "Configuration key" },
  { key: "role", label: "Role" },
  { key: "active", label: "Active" },
  { key: "published", label: "Published" },
  { key: "status", label: "System status" },
  { key: "category_id", label: "Category ID" },
  { key: "parent_id", label: "Parent category ID" },
  { key: "product_id", label: "Product ID" },
  { key: "sku_id", label: "SKU ID" },
  { key: "supplier_id", label: "Supplier ID" },
  { key: "deal_id", label: "Deal ID" },
  { key: "order_id", label: "Order ID" },
  { key: "preorder_id", label: "Preorder ID" },
  { key: "shipment_id", label: "Delivery ID" },
  { key: "order_number", label: "Order number" },
  { key: "quantity", label: "Quantity" },
  { key: "requested_qty", label: "Requested quantity" },
  { key: "allocated_qty", label: "Allocated quantity" },
  { key: "available_qty", label: "Available quantity" },
  { key: "on_hand", label: "On hand" },
  { key: "incoming", label: "Incoming" },
  { key: "allocated", label: "Allocated" },
  { key: "safety_stock", label: "Safety stock" },
  { key: "refund_cents", label: "Refund (cents)" },
  { key: "amount_cents", label: "Amount (cents)" },
  { key: "captured_cents", label: "Captured (cents)" },
  { key: "total_cents", label: "Total (cents)" },
  { key: "currency", label: "Currency" },
  { key: "provider", label: "Payment provider" },
  { key: "provider_payment_id", label: "Provider payment reference" },
  { key: "payment_reference", label: "Payment reference" },
  { key: "provider_reference", label: "Provider reference" },
  { key: "carrier", label: "Carrier" },
  { key: "tracking_number", label: "Tracking number" },
  { key: "reason_code", label: "Reason code" },
];

export function parseAuditArea(value?: string): AuditArea {
  return AUDIT_AREAS.some((area) => area.value === value) ? (value as AuditArea) : "all";
}

export function auditAreaTables(area: AuditArea): string[] | null {
  return area === "all" ? null : AREA_TABLES[area];
}

export function normalizeAuditSearch(value?: string): string {
  return (value ?? "")
    .replace(/[^\p{L}\p{N}@.+:/#-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100);
}

export function auditActionLabel(action: string): string {
  const known = ACTION_LABELS[action];
  if (known) return known;
  const words = action
    .replace(/^(ADMIN|CONTROL)_/, "")
    .replaceAll("_", " ")
    .toLowerCase();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : "Administrative action";
}

export function auditTableLabel(tableName: string): string {
  return TABLE_LABELS[tableName] ?? humanize(tableName);
}

export function auditTargetName(record: AuditRecordData): string {
  const data = record.newData ?? record.oldData;
  if (data) {
    for (const key of TARGET_NAME_KEYS) {
      const value = data[key];
      if (typeof value === "string" && value.trim()) return value.trim();
    }
  }
  return auditTableLabel(record.tableName);
}

export function auditChanges(record: AuditRecordData): AuditChange[] {
  const oldData = record.oldData ?? {};
  const newData = record.newData ?? {};
  const changes: AuditChange[] = [];

  for (const field of SAFE_CHANGE_FIELDS) {
    const hadOld = Object.prototype.hasOwnProperty.call(oldData, field.key);
    const hasNew = Object.prototype.hasOwnProperty.call(newData, field.key);
    if (!hadOld && !hasNew) continue;

    const oldValue = formatAuditValue(oldData[field.key]);
    const newValue = formatAuditValue(newData[field.key]);
    if (hadOld && hasNew && oldValue === newValue) continue;

    changes.push({
      label: field.label,
      value:
        hadOld && hasNew
          ? `${oldValue} → ${newValue}`
          : hasNew
            ? newValue
            : `${oldValue} → removed`,
    });
  }

  return changes;
}

export function resolveAuditActor(
  actor: string | null,
  staffByAuthUserId: ReadonlyMap<string, string>
): { label: string; reference: string | null } {
  if (!actor || actor === "service") return { label: "Marketplace service", reference: null };
  const authUserId = actor.replace(/^(staff|admin):/, "");
  const email = staffByAuthUserId.get(authUserId);
  return {
    label: email ?? "Unknown administrator",
    reference: actor,
  };
}

function formatAuditValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "none";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (
    Array.isArray(value) &&
    value.every((item) => ["string", "number", "boolean"].includes(typeof item))
  ) {
    return value.map(String).join(", ");
  }
  return "updated";
}

function humanize(value: string): string {
  const words = value.replaceAll("_", " ").toLowerCase();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : "Record";
}
