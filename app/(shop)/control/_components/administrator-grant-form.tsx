"use client";

import { useState } from "react";

import { AdminTextField } from "@/app/(shop)/control/_components/admin-form-fields";
import { ControlSaveButton } from "@/app/(shop)/control/_components/control-resource-ui";
import { upsertControlAccessGrant } from "@/app/actions/control";
import type { StaffRole } from "@/lib/admin-staff";
import {
  CONTROL_PERMISSION_DEFINITIONS,
  permissionsForRole,
  type ControlDomain,
  type ControlPermission,
} from "@/lib/control-permissions";

export interface GrantRecord {
  id: string;
  email: string;
  role: StaffRole;
  active: boolean;
  auth_user_id: string | null;
  created_by_staff_id: string | null;
  accepted_at: string | null;
  created_at: string;
  updated_at: string;
  admin_access_grant_permissions: Array<{ permission_key: ControlPermission }> | null;
}

const templates: Array<{ value: StaffRole; label: string; detail: string }> = [
  { value: "viewer", label: "Viewer", detail: "Control overview only" },
  {
    value: "support",
    label: "Support agent",
    detail: "Customers, communications, and order context",
  },
  { value: "catalog", label: "Catalog editor", detail: "Product identity and physical SKU data" },
  {
    value: "operations",
    label: "Operations",
    detail: "Supply, order lifecycle, and fulfilment",
  },
  {
    value: "admin",
    label: "Administrator",
    detail: "All operational domains without access provisioning",
  },
  { value: "owner", label: "Owner", detail: "All domains including administrator provisioning" },
];

const domainLabels: Record<ControlDomain, string> = {
  overview: "Overview",
  catalog: "Catalog",
  pricing: "Pricing",
  storefront: "Storefront",
  supply: "Supply",
  orders: "Orders",
  fulfilment: "Fulfilment",
  customers: "Customers",
  finance: "Finance",
  governance: "Governance",
};
const domainOrder = Object.keys(domainLabels) as ControlDomain[];

export function AdministratorGrantForm({ grant }: { grant?: GrantRecord }) {
  const accepted = Boolean(grant?.auth_user_id);
  const [template, setTemplate] = useState<StaffRole>(grant?.role ?? "viewer");
  const initialPermissions =
    grant?.admin_access_grant_permissions?.map((permission) => permission.permission_key) ??
    permissionsForRole(template);
  const [selected, setSelected] = useState<Set<ControlPermission>>(
    () => new Set(initialPermissions)
  );

  const byDomain = domainOrder.map(
    (domain) =>
      [
        domain,
        CONTROL_PERMISSION_DEFINITIONS.filter((permission) => permission.domain === domain),
      ] as const
  );

  function applyTemplate(role: StaffRole) {
    setTemplate(role);
    setSelected(new Set(permissionsForRole(role)));
  }

  function togglePermission(permission: ControlPermission, checked: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      if (checked) {
        next.add(permission);
        next.add("control.view");
        const domain = CONTROL_PERMISSION_DEFINITIONS.find(
          (item) => item.key === permission
        )?.domain;
        const viewPermission = CONTROL_PERMISSION_DEFINITIONS.find(
          (item) => item.domain === domain && item.key.endsWith(".view")
        );
        if (viewPermission) next.add(viewPermission.key);
      } else if (permission !== "control.view") {
        next.delete(permission);
      }
      return next;
    });
  }

  function toggleDomain(domain: ControlDomain, checked: boolean) {
    const permissions = CONTROL_PERMISSION_DEFINITIONS.filter(
      (permission) => permission.domain === domain
    );
    setSelected((current) => {
      const next = new Set(current);
      for (const permission of permissions) {
        if (checked) next.add(permission.key);
        else if (
          permission.key !== "control.view" &&
          !("ownerOnly" in permission && permission.ownerOnly && template === "owner")
        ) {
          next.delete(permission.key);
        }
      }
      next.add("control.view");
      return next;
    });
  }

  return (
    <form action={upsertControlAccessGrant} className="grid gap-6">
      {grant ? <input name="grantId" type="hidden" value={grant.id} /> : null}
      {template === "owner" ? (
        <input name="permissions" type="hidden" value="governance.manage" />
      ) : null}

      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_20rem]">
        <AdminTextField
          defaultValue={grant?.email}
          example="admin@example.com"
          hint={
            accepted
              ? "Accepted identities are immutable. Revoke and add a new email instead."
              : "Access activates after this exact normalized email signs in."
          }
          label="Email"
          maxLength={320}
          name="email"
          readOnly={accepted}
          required
          type="email"
        />
        <label className="grid gap-1 text-sm font-medium text-zinc-700">
          Access template
          <select
            className="min-h-11 rounded-md border border-zinc-300 px-3 text-base sm:text-sm"
            name="role"
            onChange={(event) => applyTemplate(event.target.value as StaffRole)}
            value={template}
          >
            {templates.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <span className="text-xs font-normal text-zinc-500">
            {templates.find((option) => option.value === template)?.detail}
          </span>
        </label>
      </div>

      <section>
        <div className="mb-4">
          <h2 className="font-semibold text-zinc-950">Domain coverage</h2>
          <p className="mt-1 text-sm text-zinc-600">
            Select whole domains or customize individual actions. Write access automatically retains
            read access.
          </p>
        </div>
        <div className="grid gap-4 xl:grid-cols-2">
          {byDomain.map(([domain, permissions]) => {
            const selectedCount = permissions.filter((permission) =>
              selected.has(permission.key)
            ).length;
            const allSelected = selectedCount === permissions.length;
            return (
              <fieldset
                className="rounded-xl border border-zinc-200 bg-zinc-50/60 p-4"
                key={domain}
              >
                <legend className="sr-only">{domainLabels[domain]}</legend>
                <label className="flex min-h-10 items-center gap-3 font-semibold text-zinc-950">
                  <input
                    checked={allSelected}
                    onChange={(event) => toggleDomain(domain, event.target.checked)}
                    type="checkbox"
                  />
                  {domainLabels[domain]}
                  {selectedCount > 0 && !allSelected ? (
                    <span className="text-xs font-medium text-amber-700">Partial</span>
                  ) : null}
                </label>
                <div className="mt-3 grid gap-2 border-t border-zinc-200 pt-3">
                  {permissions.map((permission) => (
                    <label
                      className="flex items-start gap-3 rounded-md p-2 hover:bg-white"
                      key={permission.key}
                    >
                      <input
                        checked={
                          "ownerOnly" in permission && permission.ownerOnly
                            ? template === "owner"
                            : selected.has(permission.key)
                        }
                        disabled={
                          permission.key === "control.view" ||
                          ("ownerOnly" in permission && permission.ownerOnly)
                        }
                        name="permissions"
                        onChange={(event) => togglePermission(permission.key, event.target.checked)}
                        type="checkbox"
                        value={permission.key}
                      />
                      <span>
                        <span className="block text-sm font-medium text-zinc-900">
                          {permission.label}
                          {"highRisk" in permission && permission.highRisk ? (
                            <span className="ml-2 text-xs text-rose-700">Sensitive</span>
                          ) : null}
                        </span>
                        <span className="mt-0.5 block text-xs leading-5 text-zinc-500">
                          {permission.description}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
            );
          })}
        </div>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-200 pt-5">
        <label className="flex min-h-11 items-center gap-2 text-sm font-medium text-zinc-700">
          <input name="active" type="hidden" value="false" />
          <input
            defaultChecked={grant?.active ?? true}
            name="active"
            type="checkbox"
            value="true"
          />
          Active
        </label>
        <div className="text-right">
          <p className="mb-2 text-xs text-zinc-500">{selected.size} permissions selected</p>
          <ControlSaveButton>
            {grant ? "Save access coverage" : "Provision administrator"}
          </ControlSaveButton>
        </div>
      </div>
    </form>
  );
}
