import {
  AdminSelectField,
  AdminTextField,
} from "@/app/(shop)/control/_components/admin-form-fields";
import { ControlSaveButton } from "@/app/(shop)/control/_components/control-resource-ui";
import { upsertControlAccessGrant } from "@/app/actions/control";
import type { StaffRole } from "@/lib/admin-staff";

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
}

const roles: Array<{ value: StaffRole; label: string }> = [
  { value: "viewer", label: "Viewer" },
  { value: "support", label: "Support" },
  { value: "catalog", label: "Catalog" },
  { value: "operations", label: "Operations" },
  { value: "admin", label: "Administrator" },
  { value: "owner", label: "Owner" },
];

export function AdministratorGrantForm({ grant }: { grant?: GrantRecord }) {
  const accepted = Boolean(grant?.auth_user_id);

  return (
    <form action={upsertControlAccessGrant} className="grid gap-5">
      {grant ? <input name="grantId" type="hidden" value={grant.id} /> : null}

      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_18rem]">
        <AdminTextField
          defaultValue={grant?.email}
          example="admin@example.com"
          hint={
            accepted
              ? "Accepted identities are immutable. Revoke this grant and add a new email instead."
              : "Access activates after the user signs in with this exact normalized email."
          }
          label="Email"
          maxLength={320}
          name="email"
          readOnly={accepted}
          required
          type="email"
        />
        <AdminSelectField
          defaultValue={grant?.role ?? "viewer"}
          example="Operations"
          hint="Choose the least-privilege role required."
          label="Role"
          name="role"
          options={roles}
          required
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex min-h-11 items-center gap-2 text-sm font-medium text-zinc-700">
          <input name="active" type="hidden" value="false" />
          <input defaultChecked={grant?.active ?? true} name="active" type="checkbox" value="true" />
          Active
        </label>
        <ControlSaveButton>{grant ? "Save access grant" : "Add administrator"}</ControlSaveButton>
      </div>
    </form>
  );
}
