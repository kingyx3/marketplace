import { notFound } from "next/navigation";

import { ManualReconciliationForm } from "@/app/(shop)/control/_components/manual-reconciliation-form";
import { ControlBackLink, ControlData } from "@/app/(shop)/control/_components/control-resource-ui";
import { PageHeader } from "@/app/_components/page-header";
import { StatusBadge } from "@/app/_components/status-badge";
import { hasControlPermission, requireControlPermission } from "@/lib/control-access";
import { listAdminOrderExceptions } from "@/lib/orders";
import { createServiceClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function PaymentExceptionPage({
  params,
}: {
  params: Promise<{ exceptionKey: string }>;
}) {
  const { exceptionKey } = await params;
  const { staff } = await requireControlPermission(
    "finance.view",
    `/control/finance/exceptions/${exceptionKey}`
  );
  const exception = (await listAdminOrderExceptions(createServiceClient())).find(
    (item) => item.key === exceptionKey
  );
  if (!exception) notFound();
  const canReconcile = hasControlPermission(staff, "payments.reconcile");
  return (
    <div className="space-y-8">
      <PageHeader
        action={
          <>
            <StatusBadge tone={exception.severity === "critical" ? "danger" : "warning"}>
              {exception.severity}
            </StatusBadge>
            <ControlBackLink href="/control/finance">Back to finance</ControlBackLink>
          </>
        }
        description={exception.detail}
        eyebrow="Control · Payment exception"
        title={exception.exceptionType.replaceAll("_", " ")}
      />
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Summary label="Source" value={exception.source} />
        <Summary label="Order" value={exception.orderId ?? "Not linked"} />
        <Summary
          label="Payment"
          value={exception.providerPaymentId ?? exception.paymentId ?? "Not linked"}
        />
        <Summary label="Detected" value={formatDate(exception.createdAt)} />
      </section>
      {canReconcile && exception.orderId ? (
        <section className="rounded-xl border border-amber-200 bg-amber-50 p-5 shadow-sm sm:p-6">
          <h2 className="mb-4 font-semibold text-zinc-950">Resolve with manual reconciliation</h2>
          <ManualReconciliationForm
            orderId={exception.orderId}
            providerPaymentId={exception.providerPaymentId}
          />
        </section>
      ) : (
        <p className="rounded-xl border border-zinc-200 bg-white p-5 text-sm text-zinc-600">
          {exception.orderId
            ? "Manual reconciliation requires the Reconcile payments permission."
            : "This exception is not linked to a local order and must be investigated before reconciliation."}
        </p>
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
