import { notFound } from "next/navigation";

import {
  AdministratorGrantForm,
  type GrantRecord,
} from "@/app/(shop)/control/_components/administrator-grant-form";
import { ControlBackLink, ControlData } from "@/app/(shop)/control/_components/control-resource-ui";
import { PageHeader } from "@/app/_components/page-header";
import { StatusBadge } from "@/app/_components/status-badge";
import { requireControlPermission } from "@/lib/control-access";
import { createServiceClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function AdministratorDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ grantId: string }>;
  searchParams?: Promise<{ saved?: string }>;
}) {
  const { grantId } = await params;
  await requireControlPermission("manage_admins", `/control/administrators/${grantId}`);
  const { data, error } = await createServiceClient()
    .from("admin_access_grants")
    .select(
      "id, email, role, active, auth_user_id, created_by_staff_id, accepted_at, created_at, updated_at"
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
            <ControlBackLink href="/control/administrators">Back to administrators</ControlBackLink>
          </>
        }
        description={grant.auth_user_id ? "Accepted administrator identity" : "Pending first sign-in"}
        eyebrow="Control · Administrator"
        title={grant.email}
      />

      {saved ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900" role="status">
          Administrator access saved successfully.
        </div>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-3">
        <Summary label="Role" value={grant.role} />
        <Summary label="Accepted" value={grant.accepted_at ? formatDate(grant.accepted_at) : "Pending"} />
        <Summary label="Updated" value={formatDate(grant.updated_at)} />
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6">
        <AdministratorGrantForm grant={grant} />
      </section>
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
