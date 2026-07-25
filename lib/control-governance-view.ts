import type { StaffRole } from "@/lib/admin-staff";

export type AdministratorStatusFilter = "all" | "active" | "revoked";
export type AdministratorIdentityFilter = "all" | "pending" | "accepted";
export type AdministratorRoleFilter = "all" | StaffRole;
export type AdministratorSort = "action" | "updated_desc" | "updated_asc" | "email";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STAFF_ROLES: StaffRole[] = ["viewer", "support", "catalog", "operations", "admin", "owner"];

export function parseAdministratorStatus(value?: string): AdministratorStatusFilter {
  return value === "active" || value === "revoked" ? value : "all";
}

export function parseAdministratorIdentity(value?: string): AdministratorIdentityFilter {
  return value === "pending" || value === "accepted" ? value : "all";
}

export function parseAdministratorRole(value?: string): AdministratorRoleFilter {
  return STAFF_ROLES.includes(value as StaffRole) ? (value as StaffRole) : "all";
}

export function parseAdministratorSort(value?: string): AdministratorSort {
  return value === "updated_desc" || value === "updated_asc" || value === "email"
    ? value
    : "action";
}

export function isAdministratorIdentifier(value: string): boolean {
  return UUID_PATTERN.test(value);
}

export function administratorRoleLabel(role: StaffRole): string {
  return (
    {
      viewer: "Viewer",
      support: "Support",
      catalog: "Catalog",
      operations: "Operations",
      admin: "Admin",
      owner: "Owner",
    }[role] ?? role
  );
}

export function administratorIdentityLabel(authUserId: string | null): string {
  return authUserId ? "Identity accepted" : "Pending first sign-in";
}

export function administratorSystemStatus(active: boolean): "active" | "revoked" {
  return active ? "active" : "revoked";
}
