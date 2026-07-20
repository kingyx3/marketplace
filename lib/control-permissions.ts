import type { StaffProfile, StaffRole } from "@/lib/admin-staff";

export type ControlDomain =
  | "overview"
  | "catalog"
  | "pricing"
  | "storefront"
  | "supply"
  | "orders"
  | "fulfilment"
  | "customers"
  | "finance"
  | "governance";

export const CONTROL_PERMISSION_DEFINITIONS = [
  {
    key: "control.view",
    domain: "overview",
    label: "View control centre",
    description: "Open the control centre and assigned workspaces.",
  },
  {
    key: "catalog.view",
    domain: "catalog",
    label: "View catalog",
    description: "Review products, SKUs, categories, sets, and product types.",
  },
  {
    key: "catalog.manage",
    domain: "catalog",
    label: "Manage catalog",
    description: "Create and edit product identity, media, and physical SKU data.",
  },
  {
    key: "pricing.view",
    domain: "pricing",
    label: "View pricing",
    description: "Review current and historical SKU prices.",
  },
  {
    key: "pricing.manage",
    domain: "pricing",
    label: "Manage pricing",
    description: "Set base prices and comparison prices.",
  },
  {
    key: "pricing.approve",
    domain: "pricing",
    label: "Approve sensitive pricing",
    description: "Approve high-impact pricing and promotion changes.",
    highRisk: true,
  },
  {
    key: "storefront.view",
    domain: "storefront",
    label: "View storefront",
    description: "Review listing content, availability, and publication state.",
  },
  {
    key: "storefront.manage",
    domain: "storefront",
    label: "Manage listings",
    description: "Edit listing content, limits, availability, and merchandising.",
  },
  {
    key: "storefront.publish",
    domain: "storefront",
    label: "Publish listings",
    description: "Publish, unpublish, or schedule customer-facing listings.",
    highRisk: true,
  },
  {
    key: "supply.view",
    domain: "supply",
    label: "View supply",
    description: "Review inventory, suppliers, and purchase orders.",
  },
  {
    key: "suppliers.manage",
    domain: "supply",
    label: "Manage suppliers",
    description: "Create and maintain supplier records.",
  },
  {
    key: "inventory.adjust",
    domain: "supply",
    label: "Adjust inventory",
    description: "Record reason-coded stock and safety-stock adjustments.",
    highRisk: true,
  },
  {
    key: "purchase_orders.manage",
    domain: "supply",
    label: "Manage purchase orders",
    description: "Create and maintain supplier purchase orders.",
    highRisk: true,
  },
  {
    key: "orders.view",
    domain: "orders",
    label: "View orders",
    description: "Review normal orders, preorders, and operational exceptions.",
  },
  {
    key: "orders.manage",
    domain: "orders",
    label: "Manage orders",
    description: "Manage non-financial order lifecycle actions.",
  },
  {
    key: "preorders.allocate",
    domain: "orders",
    label: "Allocate preorders",
    description: "Review and confirm FIFO preorder allocations.",
    highRisk: true,
  },
  {
    key: "fulfilment.view",
    domain: "fulfilment",
    label: "View fulfilment",
    description: "Review packing and shipment queues.",
  },
  {
    key: "fulfilment.manage",
    domain: "fulfilment",
    label: "Manage fulfilment",
    description: "Arrange shipments and update delivery progress.",
  },
  {
    key: "customers.view",
    domain: "customers",
    label: "View customers",
    description: "Search customers and review lifecycle and order context.",
  },
  {
    key: "customers.manage",
    domain: "customers",
    label: "Manage customer access",
    description: "Disable or restore customer access.",
    highRisk: true,
  },
  {
    key: "communications.manage",
    domain: "customers",
    label: "Manage communications",
    description: "Send operational and restock communications.",
  },
  {
    key: "finance.view",
    domain: "finance",
    label: "View finance",
    description: "Review payments, refunds, and provider exceptions.",
  },
  {
    key: "payments.reconcile",
    domain: "finance",
    label: "Reconcile payments",
    description: "Record reviewed manual payment reconciliations.",
    highRisk: true,
  },
  {
    key: "refunds.manage",
    domain: "finance",
    label: "Manage refunds",
    description: "Approve or execute refund-bearing workflows.",
    highRisk: true,
  },
  {
    key: "governance.view",
    domain: "governance",
    label: "View governance",
    description: "Review administrator access and governance state.",
  },
  {
    key: "governance.manage",
    domain: "governance",
    label: "Manage administrators",
    description: "Provision administrators and change domain coverage.",
    highRisk: true,
    ownerOnly: true,
  },
  {
    key: "audit.view",
    domain: "governance",
    label: "View audit history",
    description: "Review immutable administrative activity.",
  },
] as const satisfies ReadonlyArray<{
  key: string;
  domain: ControlDomain;
  label: string;
  description: string;
  highRisk?: boolean;
  ownerOnly?: boolean;
}>;

export type ControlPermission = (typeof CONTROL_PERMISSION_DEFINITIONS)[number]["key"];

export const CONTROL_PERMISSION_KEYS = CONTROL_PERMISSION_DEFINITIONS.map(
  (permission) => permission.key
) as ControlPermission[];

const viewer: ControlPermission[] = ["control.view"];
const support: ControlPermission[] = [
  ...viewer,
  "orders.view",
  "customers.view",
  "communications.manage",
  "audit.view",
];
const catalog: ControlPermission[] = [
  ...viewer,
  "catalog.view",
  "catalog.manage",
  "pricing.view",
  "storefront.view",
  "audit.view",
];
const operations: ControlPermission[] = [
  ...viewer,
  "supply.view",
  "suppliers.manage",
  "inventory.adjust",
  "purchase_orders.manage",
  "orders.view",
  "orders.manage",
  "fulfilment.view",
  "fulfilment.manage",
  "audit.view",
];
const administrator = CONTROL_PERMISSION_KEYS.filter(
  (permission) => permission !== "governance.manage"
);

export const ROLE_PERMISSIONS: Record<StaffRole, readonly ControlPermission[]> = {
  viewer,
  support,
  catalog,
  operations,
  admin: administrator,
  owner: CONTROL_PERMISSION_KEYS,
};

export function permissionsForRole(role: StaffRole): ControlPermission[] {
  return [...ROLE_PERMISSIONS[role]];
}

export function hasControlPermission(
  staff: Pick<StaffProfile, "active" | "role" | "permissions" | "source"> | null,
  permission: ControlPermission
): boolean {
  if (!staff?.active) return false;
  if (staff.role === "owner" && staff.source === "environment") return true;
  const effective = staff.permissions ?? ROLE_PERMISSIONS[staff.role];
  return effective.includes(permission);
}
