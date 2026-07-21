import Link from "next/link";
import { redirect } from "next/navigation";

import { MetricCard } from "@/app/_components/metric-card";
import { PageHeader } from "@/app/_components/page-header";
import { StatusBadge } from "@/app/_components/status-badge";
import { hasControlPermission, requireControlPermission } from "@/lib/control-access";
import { createSecretClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function ControlGovernancePage() {
  const { staff } = await requireControlPermission("control.view", "/control/governance");
  const canViewAccess = hasControlPermission(staff, "governance.view");
  const canViewAudit = hasControlPermission(staff, "audit.view");
  if (!canViewAccess && !canViewAudit) redirect("/access-denied");

  const supabase = createSecretClient();
  const [grantsResult, auditResult] = await Promise.all([
    canViewAccess
      ? supabase
          .from("admin_access_grants")
          .select("id", { count: "exact", head: true })
          .eq("active", true)
      : Promise.resolve({ count: null, error: null }),
    canViewAudit
      ? supabase.from("audit_logs").select("id", { count: "exact", head: true })
      : Promise.resolve({ count: null, error: null }),
  ]);
  if (grantsResult.error)
    throw new Error(`Administrator count failed: ${grantsResult.error.message}`);
  if (auditResult.error) throw new Error(`Audit count failed: ${auditResult.error.message}`);

  return (
    <div className="space-y-8">
      <PageHeader
        description="Keep access provisioning and immutable administrative evidence together, separate from daily commerce operations."
        eyebrow="Control"
        title="Governance"
      />
      <section className="grid gap-4 sm:grid-cols-2">
        {canViewAccess ? (
          <MetricCard
            label="Active delegated grants"
            value={String(grantsResult.count ?? 0)}
            detail="Database-managed administrators"
          />
        ) : null}
        {canViewAudit ? (
          <MetricCard
            label="Audit records"
            value={String(auditResult.count ?? 0)}
            detail="Administrative evidence"
          />
        ) : null}
      </section>
      <section className="grid gap-4 lg:grid-cols-2">
        {canViewAccess ? (
          <GovernanceCard
            detail="Review administrator coverage. Owners can provision action-level access with domain checkboxes."
            href="/control/governance/administrators"
            label="Administrator access"
            status={hasControlPermission(staff, "governance.manage") ? "Owner controls" : "Review"}
          />
        ) : null}
        {canViewAudit ? (
          <GovernanceCard
            detail="Trace catalog, pricing, listing, supply, order, finance, and access mutations."
            href="/control/governance/audit"
            label="Audit history"
            status="Review"
          />
        ) : null}
      </section>
    </div>
  );
}

function GovernanceCard({
  detail,
  href,
  label,
  status,
}: {
  detail: string;
  href: string;
  label: string;
  status: string;
}) {
  return (
    <Link
      className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm transition hover:border-emerald-500 hover:shadow-md"
      href={href}
    >
      <div className="flex items-start justify-between gap-3">
        <h2 className="font-semibold text-zinc-950">{label}</h2>
        <StatusBadge tone="info">{status}</StatusBadge>
      </div>
      <p className="mt-2 text-sm leading-6 text-zinc-600">{detail}</p>
    </Link>
  );
}
