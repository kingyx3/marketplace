import { upsertControlAccessGrant } from "@/app/actions/control";
import { requireControlPermission } from "@/lib/control-access";
import type { StaffRole } from "@/lib/admin-staff";
import { createServiceClient } from "@/lib/supabase";

interface StaffRow {
  id: string;
  auth_user_id: string;
  email: string | null;
  role: StaffRole;
  active: boolean;
  source: "database" | "environment";
  created_at: string;
  last_seen_at: string | null;
}

interface GrantRow {
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

const roles: Array<[StaffRole, string]> = [
  ["viewer", "Viewer"],
  ["support", "Support"],
  ["catalog", "Catalog"],
  ["operations", "Operations"],
  ["admin", "Administrator"],
  ["owner", "Owner"],
];

export const dynamic = "force-dynamic";

export default async function ControlAdministratorsPage() {
  const { staff: currentStaff } = await requireControlPermission(
    "manage_admins",
    "/control/administrators"
  );
  const supabase = createServiceClient();
  const [staffResult, grantResult] = await Promise.all([
    supabase
      .from("staff_users")
      .select("id, auth_user_id, email, role, active, source, created_at, last_seen_at")
      .order("source", { ascending: false })
      .order("created_at"),
    supabase
      .from("admin_access_grants")
      .select(
        "id, email, role, active, auth_user_id, created_by_staff_id, accepted_at, created_at, updated_at"
      )
      .order("active", { ascending: false })
      .order("email"),
  ]);

  if (staffResult.error) throw new Error(`Staff list failed: ${staffResult.error.message}`);
  if (grantResult.error) throw new Error(`Administrator grant list failed: ${grantResult.error.message}`);

  const staffRows = (staffResult.data ?? []) as StaffRow[];
  const grants = (grantResult.data ?? []) as GrantRow[];
  const environmentOwners = staffRows.filter((row) => row.source === "environment");

  return (
    <div className="space-y-8">
      <PageHeading
        title="Administrators"
        description="Grant role-scoped console access by normalized email. Environment allowlisted owners remain controlled by ADMIN_EMAIL_ALLOWLIST and cannot be removed here."
      />

      <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-zinc-950">Add administrator</h2>
            <p className="mt-1 text-sm text-zinc-500">
              Access activates after the user signs in with the exact email address.
            </p>
          </div>
          <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-semibold capitalize text-zinc-700">
            Acting as {currentStaff.role}
          </span>
        </div>
        <GrantForm />
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-zinc-950">Environment owners</h2>
          <span className="text-sm text-zinc-500">{environmentOwners.length}</span>
        </div>
        {environmentOwners.length === 0 ? (
          <EmptyState text="No environment owner has signed in yet. ADMIN_EMAIL_ALLOWLIST remains authoritative." />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {environmentOwners.map((row) => (
              <article key={row.id} className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-5">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="font-semibold text-zinc-950">{row.email ?? "Email pending"}</h3>
                  <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-800">
                    Protected owner
                  </span>
                </div>
                <p className="mt-3 text-sm text-zinc-600">
                  Last seen: {row.last_seen_at ? formatDate(row.last_seen_at) : "Not recorded"}
                </p>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-zinc-950">Delegated access</h2>
          <span className="text-sm text-zinc-500">{grants.length} grants</span>
        </div>
        {grants.length === 0 ? (
          <EmptyState text="No database-managed administrators have been added." />
        ) : (
          <div className="grid gap-4 xl:grid-cols-2">
            {grants.map((grant) => (
              <article key={grant.id} className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold text-zinc-950">{grant.email}</h3>
                    <p className="mt-1 text-sm text-zinc-500">
                      {grant.auth_user_id ? "Accepted" : "Pending first sign-in"}
                      {grant.accepted_at ? ` · ${formatDate(grant.accepted_at)}` : ""}
                    </p>
                  </div>
                  <Status active={grant.active} />
                </div>
                <GrantForm grant={grant} />
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function GrantForm({ grant }: { grant?: GrantRow }) {
  const accepted = Boolean(grant?.auth_user_id);

  return (
    <form action={upsertControlAccessGrant} className="mt-4 grid gap-4 md:grid-cols-[minmax(0,1fr)_14rem_auto] md:items-end">
      {grant ? <input name="grantId" type="hidden" value={grant.id} /> : null}
      <label className="grid gap-1 text-sm font-medium text-zinc-700">
        Email
        <input
          className="min-h-10 rounded-md border border-zinc-300 px-3 text-sm read-only:bg-zinc-100 read-only:text-zinc-600"
          defaultValue={grant?.email}
          name="email"
          readOnly={accepted}
          required
          type="email"
        />
        {accepted ? (
          <span className="text-xs font-normal text-zinc-500">
            Accepted identities are immutable. Revoke this grant and add a new email instead.
          </span>
        ) : null}
      </label>
      <label className="grid gap-1 text-sm font-medium text-zinc-700">
        Role
        <select
          className="min-h-10 rounded-md border border-zinc-300 px-3 text-sm"
          defaultValue={grant?.role ?? "viewer"}
          name="role"
        >
          {roles.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <div className="flex flex-wrap items-center gap-3 md:justify-end">
        <label className="flex items-center gap-2 text-sm font-medium text-zinc-700">
          <input name="active" type="hidden" value="false" />
          <input defaultChecked={grant?.active ?? true} name="active" type="checkbox" value="true" />
          Active
        </label>
        <button className="rounded-md bg-zinc-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700">
          {grant ? "Save" : "Add"}
        </button>
      </div>
    </form>
  );
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-SG", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Singapore",
  }).format(new Date(value));
}

function PageHeading({ title, description }: { title: string; description: string }) {
  return (
    <div>
      <p className="text-sm font-semibold uppercase tracking-[0.16em] text-emerald-700">Security</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-950">{title}</h1>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-600">{description}</p>
    </div>
  );
}

function Status({ active }: { active: boolean }) {
  return (
    <span
      className={
        active
          ? "rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700"
          : "rounded-full bg-zinc-100 px-2 py-1 text-xs font-semibold text-zinc-600"
      }
    >
      {active ? "Active" : "Revoked"}
    </span>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="rounded-xl border border-dashed border-zinc-300 bg-white p-8 text-sm text-zinc-500">{text}</div>;
}
