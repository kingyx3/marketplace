import { ManualReconciliationForm } from "@/app/(shop)/control/_components/manual-reconciliation-form";
import { ControlBackLink } from "@/app/(shop)/control/_components/control-resource-ui";
import { PageHeader } from "@/app/_components/page-header";
import { requireControlPermission } from "@/lib/control-access";

export const dynamic = "force-dynamic";

export default async function NewReconciliationPage({
  searchParams,
}: {
  searchParams?: Promise<{ orderId?: string; providerPaymentId?: string }>;
}) {
  await requireControlPermission("payments.reconcile", "/control/finance/reconciliations/new");
  const params = (await searchParams) ?? {};
  return (
    <div className="space-y-8">
      <PageHeader
        action={<ControlBackLink href="/control/finance">Back to finance</ControlBackLink>}
        description="Use only after independently verifying the HitPay reference, amount, currency, and order."
        eyebrow="Control · Finance"
        title="Create manual reconciliation"
      />
      <section className="rounded-xl border border-amber-200 bg-amber-50 p-5 shadow-sm sm:p-6">
        <ManualReconciliationForm
          orderId={params.orderId}
          providerPaymentId={params.providerPaymentId}
        />
      </section>
    </div>
  );
}
