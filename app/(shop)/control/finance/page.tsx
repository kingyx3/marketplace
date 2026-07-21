import Link from "next/link";

import { MetricCard } from "@/app/_components/metric-card";
import { PageHeader } from "@/app/_components/page-header";
import { StatusBadge } from "@/app/_components/status-badge";
import { hasControlPermission, requireControlPermission } from "@/lib/control-access";
import { listAdminOrderExceptions } from "@/lib/order-exceptions";
import { createSecretClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function ControlFinancePage({
  searchParams,
}: {
  searchParams?: Promise<{ reconciled?: string }>;
}) {
  const { staff } = await requireControlPermission("finance.view", "/control/finance");
  const params = (await searchParams) ?? {};
  const exceptions = await listAdminOrderExceptions(createSecretClient());
  const critical = exceptions.filter((exception) => exception.severity === "critical").length;
  const canReconcile = hasControlPermission(staff, "payments.reconcile");

  return (
    <div className="space-y-8">
      <PageHeader
        action={
          canReconcile ? (
            <Link
              className="inline-flex min-h-10 items-center rounded-md bg-zinc-950 px-4 text-sm font-semibold text-white hover:bg-emerald-700"
              href="/control/finance/reconciliations/new"
            >
              Create reconciliation
            </Link>
          ) : undefined
        }
        description="Review payments, provider exceptions, refunds, and audited reconciliation without granting order or fulfilment authority."
        eyebrow="Control"
        title="Finance"
      />
      <section className="grid gap-4 sm:grid-cols-3">
        <MetricCard
          label="Open exceptions"
          value={String(exceptions.length)}
          detail="Requires financial review"
        />
        <MetricCard label="Critical" value={String(critical)} detail="Highest priority" />
        <MetricCard
          label="Reconciliation"
          value={canReconcile ? "Enabled" : "Read only"}
          detail="Current access coverage"
        />
      </section>

      {params.reconciled === "1" ? (
        <div
          className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900"
          role="status"
        >
          Manual reconciliation recorded successfully.
        </div>
      ) : null}

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-zinc-950">Payment exceptions</h2>
        {exceptions.length === 0 ? (
          <p className="rounded-xl border border-zinc-200 bg-white p-5 text-sm text-zinc-500">
            No open payment exceptions.
          </p>
        ) : null}
        <div className="grid gap-4 xl:grid-cols-2">
          {exceptions.map((exception) => (
            <Link
              className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm transition hover:border-emerald-500 hover:shadow-md"
              href={`/control/finance/exceptions/${encodeURIComponent(exception.key)}`}
              key={exception.key}
            >
              <div className="flex flex-wrap justify-between gap-3">
                <h3 className="font-semibold text-zinc-950">
                  {exception.exceptionType.replaceAll("_", " ")}
                </h3>
                <StatusBadge tone={exception.severity === "critical" ? "danger" : "warning"}>
                  {exception.severity}
                </StatusBadge>
              </div>
              <p className="mt-3 text-sm leading-6 text-zinc-600">{exception.detail}</p>
              <p className="mt-3 text-xs text-zinc-500">
                {exception.orderId ? `Order ${exception.orderId}` : "Provider-only exception"}
              </p>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
