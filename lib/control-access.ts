import { redirect } from "next/navigation";

import { requireStaff } from "@/lib/auth";
import type { StaffProfile, StaffRole } from "@/lib/admin-staff";

export type ControlPermission =
  | "view_control"
  | "manage_catalog"
  | "manage_suppliers"
  | "manage_orders"
  | "manage_admins"
  | "view_audit";

const ROLE_PERMISSIONS: Record<StaffRole, ReadonlySet<ControlPermission>> = {
  viewer: new Set(["view_control"]),
  support: new Set(["view_control", "manage_orders", "view_audit"]),
  catalog: new Set(["view_control", "manage_catalog", "view_audit"]),
  operations: new Set([
    "view_control",
    "manage_suppliers",
    "manage_orders",
    "view_audit",
  ]),
  admin: new Set([
    "view_control",
    "manage_catalog",
    "manage_suppliers",
    "manage_orders",
    "manage_admins",
    "view_audit",
  ]),
  owner: new Set([
    "view_control",
    "manage_catalog",
    "manage_suppliers",
    "manage_orders",
    "manage_admins",
    "view_audit",
  ]),
};

export function hasControlPermission(
  staff: Pick<StaffProfile, "active" | "role"> | null,
  permission: ControlPermission
): boolean {
  return Boolean(staff?.active && ROLE_PERMISSIONS[staff.role].has(permission));
}

export async function requireControlPermission(
  permission: ControlPermission,
  next = "/control"
) {
  const context = await requireStaff(next);
  if (!hasControlPermission(context.staff, permission)) {
    redirect("/access-denied");
  }
  return context;
}
