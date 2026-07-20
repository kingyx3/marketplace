import {
  AdminNumberField,
  AdminTextField,
} from "@/app/(shop)/control/_components/admin-form-fields";
import { MetricCard } from "@/app/_components/metric-card";
import { PageHeader } from "@/app/_components/page-header";
import { StatusBadge } from "@/app/_components/status-badge";
import { runAdminOrderAction } from "@/app/actions/admin";
import { hasControlPermission, requireControlPermission } from "@/lib/control-access";
import { listAdminOrderExceptions } from "@/lib/orders";
import { createServiceClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function ControlFinancePage() {
  const { staff } = await requireControlPermission("finance.view", "/control/finance");
  const exceptions = await listAdminOrderExceptions(createServiceClient());
  const critical = exceptions.filter((exception) => exception.severity === "critical").length;
  const canReconcile = hasControlPermission(staff, "payments.reconcile");

  return (
    <div className="space-y-8">
      <PageHeader
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

      {canReconcile ? (
        <section className="rounded-xl border border-amber-200 bg-amber-50 p-5 shadow-sm sm:p-6">
          <h2 className="text-lg font-semibold text-zinc-950">Manual reconciliation</h2>
          <p className="mt-1 text-sm text-zinc-600">
            Use only after verifying the Stripe reference, amount, currency, and order
            independently.
          </p>
          <form action={runAdminOrderAction} className="mt-4 grid gap-3 lg:grid-cols-2">
            <input name="action" type="hidden" value="record_manual_reconciliation" />
            <input name="provider" type="hidden" value="stripe" />
            <AdminTextField example="Order UUID" label="Order ID" name="orderId" required />
            <AdminTextField
              example="pi_..."
              label="Stripe payment reference"
              name="providerPaymentId"
              required
            />
            <AdminNumberField
              example="18900"
              label="Amount cents"
              min={1}
              name="amountCents"
              required
            />
            <AdminTextField
              defaultValue="SGD"
              example="SGD"
              label="Currency"
              maxLength={3}
              minLength={3}
              name="currency"
              required
            />
            <div className="lg:col-span-2">
              <AdminTextField
                example="Verified against Stripe dashboard and webhook event"
                label="Reason"
                maxLength={500}
                name="reason"
                required
              />
            </div>
            <button className="min-h-11 rounded-md bg-zinc-950 px-5 text-sm font-semibold text-white lg:col-span-2">
              Record audited reconciliation
            </button>
          </form>
        </section>
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
            <article
              className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm"
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
              {exception.orderId ? (
                <p className="mt-2 font-mono text-xs text-zinc-400">Order {exception.orderId}</p>
              ) : null}
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
