export type CustomerStatusFilter = "all" | "active" | "disabled";
export type CustomerIdentityFilter = "all" | "linked" | "unlinked";
export type CustomerProvisioningFilter = "all" | "attention" | "active" | "pending" | "error";
export type CustomerSort = "updated_desc" | "updated_asc" | "created_desc" | "name" | "email";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseCustomerStatus(value?: string): CustomerStatusFilter {
  return value === "active" || value === "disabled" ? value : "all";
}

export function parseCustomerIdentity(value?: string): CustomerIdentityFilter {
  return value === "linked" || value === "unlinked" ? value : "all";
}

export function parseCustomerProvisioning(value?: string): CustomerProvisioningFilter {
  return ["attention", "active", "pending", "error"].includes(value ?? "")
    ? (value as CustomerProvisioningFilter)
    : "all";
}

export function parseCustomerSort(value?: string): CustomerSort {
  return ["updated_asc", "created_desc", "name", "email"].includes(value ?? "")
    ? (value as CustomerSort)
    : "updated_desc";
}

export function isCustomerIdentifier(value: string): boolean {
  return UUID_PATTERN.test(value);
}

export function customerAccountLabel(deletedAt: string | null): string {
  return deletedAt ? "Access disabled" : "Active";
}

export function customerAccountSystemStatus(deletedAt: string | null): "active" | "disabled" {
  return deletedAt ? "disabled" : "active";
}

export function customerProvisioningLabel(value: string): string {
  return (
    {
      active: "Provisioned",
      pending: "Provisioning pending",
      error: "Provisioning error",
    }[value] ?? humanize(value)
  );
}

export function customerProvisioningNeedsAttention(value: string): boolean {
  return value === "pending" || value === "error";
}

function humanize(value: string): string {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
