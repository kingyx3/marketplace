import Link from "next/link";

import {
  ControlData,
  ControlEmptyState,
  ControlPrimaryLink,
} from "@/app/(shop)/control/_components/control-resource-ui";
import type { GrantRecord } from "@/app/(shop)/control/_components/administrator-grant-form";
import { PageHeader } from "@/app/_components/page-header";
import { StatusBadge } from "@/app/_components/status-badge";
import { hasControlPermission, requireControlPermission } from "@/lib/control-access";
import type { StaffRole } from "@/lib/admin-staff";
import { createSecretClient } from "@/lib/supabase";

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

export const dynamic = "force-dynamic";

export default async function ControlAdministratorsPage({
  searchParams,
}: {
  searchParams?: Promise<{ q?: string; status?: string }>;
}) {
  const { staff: currentStaff } = await requireControlPermission(
    "governance.view",
    "/control/governance/administrators"
  );
  const canManage = hasControlPermission(currentStaff, "governance.manage");
  const params = (await searchParams) ?? {};
  const query = params.q?.trim().toLowerCase() ?? "";
  const status =
    params.status === "active" ? "active" : params.status === "revoked" ? "revoked" : "all";
  const supabase = createSecretClient();
  const [staffResult, grantResult] = await Promise.all([
    supabase
      .from("staff_users")
      .select("id, auth_user_id, email, role, active, source, created_at, last_seen_at")
      .eq("source", "environment")
      .order("created_at"),
    supabase
      .from("admin_access_grants")
      .select(
        "id, email, role, active, auth_user_id, created_by_staff_id, accepted_at, created_at, updated_at, admin_access_grant_permissions(permission_key)"
      )
      .order("active", { ascending: false })
      .order("email"),
  ]);

  if (staffResult.error) throw new Error(`Staff list failed: ${staffResult.error.message}`);
  if (grantResult.error)
    throw new Error(`Administrator grant list failed: ${grantResult.error.message}`);

  const environmentOwners = (staffResult.data ?? []) as StaffRow[];
  const grants = ((grantResult.data ?? []) as GrantRecord[]).filter((grant) => {
    const matchesStatus = status === "all" || (status === "active" ? grant.active : !grant.active);
    return (
      matchesStatus &&
      (!query || grant.email.toLowerCase().includes(query) || grant.role.includes(query))
    );
  });

  return (
    <div className="space-y-8">
      <PageHeader
        action={
          <>
            <StatusBadge tone="success">Acting as {currentStaff.role}</StatusBadge>
            {canManage ? (
              <ControlPrimaryLink href="/control/governance/administrators/new">
                Create administrator
              </ControlPrimaryLink>
            ) : null}
          </>
        }
        description="Review protected environment owners and exact delegated domain coverage. Only owners can provision or change access."
        eyebrow="Control"
        title="Administrators"
      />

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-zinc-950">Environment owners</h2>
          <span className="text-sm text-zinc-500">{environmentOwners.length}</span>
        </div>
        {environmentOwners.length === 0 ? (
          <ControlEmptyState
            description="ADMIN_EMAIL_ALLOWLIST remains authoritative even when an owner has not signed in yet."
            title="No environment owner has signed in"
          />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {environmentOwners.map((owner) => (
              <article
                key={owner.id}
                className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-5"
              >
                <div className="flex items-center justify-between gap-3">
                  <h3 className="break-all font-semibold text-zinc-950">
                    {owner.email ?? "Email pending"}
                  </h3>
                  <StatusBadge tone="success">Protected owner</StatusBadge>
                </div>
                <dl className="mt-4 grid gap-3 text-sm">
                  <ControlData
                    label="Last seen"
                    value={owner.last_seen_at ? formatDate(owner.last_seen_at) : "Not recorded"}
                  />
                </dl>
              </article>
            ))}
          </div>
        )}
      </section>

      <form className="grid gap-3 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm sm:grid-cols-[minmax(0,1fr)_12rem_auto]">
        <label className="grid gap-1 text-sm font-medium text-zinc-700">
          Search
          <input
            className="min-h-11 rounded-md border border-zinc-300 px-3 text-base sm:text-sm"
            defaultValue={params.q ?? ""}
            name="q"
            placeholder="Email or role"
          />
        </label>
        <label className="grid gap-1 text-sm font-medium text-zinc-700">
          Status
          <select
            className="min-h-11 rounded-md border border-zinc-300 px-3 text-base sm:text-sm"
            defaultValue={status}
            name="status"
          >
            <option value="all">All</option>
            <option value="active">Active</option>
            <option value="revoked">Revoked</option>
          </select>
        </label>
        <button className="min-h-11 self-end rounded-md bg-zinc-950 px-5 text-sm font-semibold text-white hover:bg-emerald-700">
          Filter
        </button>
      </form>

      {grants.length === 0 ? (
        <ControlEmptyState
          action={
            canManage ? (
              <ControlPrimaryLink href="/control/governance/administrators/new">
                Create administrator
              </ControlPrimaryLink>
            ) : undefined
          }
          description="Create the first delegated grant or broaden the current filters."
          title="No delegated grants match this view"
        />
      ) : (
        <section className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-zinc-950">Delegated access</h2>
            <span className="text-sm text-zinc-500">{grants.length} results</span>
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            {grants.map((grant) => (
              <Link
                className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm transition hover:border-emerald-500 hover:shadow-md"
                href={`/control/governance/administrators/${grant.id}`}
                key={grant.id}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="break-all font-semibold text-zinc-950">{grant.email}</h3>
                    <p className="mt-1 text-sm text-zinc-500">
                      {grant.auth_user_id ? "Accepted" : "Pending first sign-in"}
                      {grant.accepted_at ? ` · ${formatDate(grant.accepted_at)}` : ""}
                    </p>
                  </div>
                  <StatusBadge tone={grant.active ? "success" : "warning"}>
                    {grant.active ? "Active" : "Revoked"}
                  </StatusBadge>
                </div>
                <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                  <ControlData label="Role" value={grant.role} />
                  <ControlData
                    label="Permissions"
                    value={String(grant.admin_access_grant_permissions?.length ?? 0)}
                  />
                  <ControlData label="Updated" value={formatDate(grant.updated_at)} />
                </dl>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-SG", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Singapore",
  }).format(new Date(value));
}
