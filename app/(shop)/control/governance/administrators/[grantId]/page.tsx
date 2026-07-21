import { notFound } from "next/navigation";

import {
  AdministratorGrantForm,
  type GrantRecord,
} from "@/app/(shop)/control/_components/administrator-grant-form";
import { ControlBackLink, ControlData } from "@/app/(shop)/control/_components/control-resource-ui";
import { PageHeader } from "@/app/_components/page-header";
import { StatusBadge } from "@/app/_components/status-badge";
import { hasControlPermission, requireControlPermission } from "@/lib/control-access";
import { createSecretClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function AdministratorDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ grantId: string }>;
  searchParams?: Promise<{ saved?: string }>;
}) {
  const { grantId } = await params;
  const { staff } = await requireControlPermission(
    "governance.view",
    `/control/governance/administrators/${grantId}`
  );
  const { data, error } = await createSecretClient()
    .from("admin_access_grants")
    .select(
      "id, email, role, active, auth_user_id, created_by_staff_id, accepted_at, created_at, updated_at, admin_access_grant_permissions(permission_key)"
    )
    .eq("id", grantId)
    .maybeSingle();

  if (error) throw new Error(`Administrator grant lookup failed: ${error.message}`);
  if (!data) notFound();

  const grant = data as GrantRecord;
  const saved = (await searchParams)?.saved === "1";

  return (
    <div className="space-y-8">
      <PageHeader
        action={
          <>
            <StatusBadge tone={grant.active ? "success" : "warning"}>
              {grant.active ? "Active" : "Revoked"}
            </StatusBadge>
            <ControlBackLink href="/control/governance/administrators">
              Back to administrators
            </ControlBackLink>
          </>
        }
        description={
          grant.auth_user_id ? "Accepted administrator identity" : "Pending first sign-in"
        }
        eyebrow="Control · Administrator"
        title={grant.email}
      />

      {saved ? (
        <div
          className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900"
          role="status"
        >
          Administrator access saved successfully.
        </div>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-3">
        <Summary label="Template" value={grant.role} />
        <Summary
          label="Accepted"
          value={grant.accepted_at ? formatDate(grant.accepted_at) : "Pending"}
        />
        <Summary
          label="Domain permissions"
          value={String(grant.admin_access_grant_permissions?.length ?? 0)}
        />
        <Summary label="Updated" value={formatDate(grant.updated_at)} />
      </section>

      {hasControlPermission(staff, "governance.manage") ? (
        <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6">
          <AdministratorGrantForm grant={grant} />
        </section>
      ) : (
        <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6">
          <h2 className="font-semibold text-zinc-950">Granted permissions</h2>
          <ul className="mt-3 grid gap-2 text-sm text-zinc-600 sm:grid-cols-2">
            {(grant.admin_access_grant_permissions ?? []).map((permission) => (
              <li
                className="rounded-md bg-zinc-50 px-3 py-2 font-mono text-xs"
                key={permission.permission_key}
              >
                {permission.permission_key}
              </li>
            ))}
          </ul>
          <p className="mt-4 text-sm text-zinc-500">
            Only an owner can change administrator coverage.
          </p>
        </section>
      )}
    </div>
  );
}

function Summary({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
      <ControlData label={label} value={value} />
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
