import { ControlBackLink, ControlData } from "@/app/(shop)/control/_components/control-resource-ui";
import { PageHeader } from "@/app/_components/page-header";
import { StatusBadge } from "@/app/_components/status-badge";
import { requireControlPermission } from "@/lib/control-access";
import { formatMoney } from "@/lib/money";
import { getAdminPreorder } from "@/lib/orders";
import { createSecretClient } from "@/lib/supabase";
import { toOne } from "@/lib/supabase-relations";

export const dynamic = "force-dynamic";

export default async function PreorderPage({
  params,
}: {
  params: Promise<{ preorderId: string }>;
}) {
  const { preorderId } = await params;
  await requireControlPermission("orders.view", `/control/orders/preorders/${preorderId}`);
  const preorder = await getAdminPreorder(createSecretClient(), preorderId);
  const customer = toOne(preorder.customers);
  const referenceCode = toOne(preorder.products);
  return (
    <div className="space-y-8">
      <PageHeader
        action={
          <>
            <StatusBadge tone="info">{preorder.status}</StatusBadge>
            <ControlBackLink href="/control/orders">Back to orders</ControlBackLink>
          </>
        }
        description={customer?.email ?? preorder.id}
        eyebrow="Control · Preorder"
        title={customer?.name || "Preorder"}
      />
      <section className="grid gap-4 sm:grid-cols-4">
        <Summary label="Product" value={referenceCode?.reference_code ?? "Unknown"} />
        <Summary label="Requested" value={String(preorder.quantity)} />
        <Summary label="Allocated" value={String(preorder.allocated_qty)} />
        <Summary
          label="Value"
          value={formatMoney(preorder.quantity * preorder.unit_price_cents, preorder.currency)}
        />
      </section>
      <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
        <h2 className="font-semibold text-zinc-950">Commercial record</h2>
        <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
          <ControlData
            label="Deposit"
            value={formatMoney(preorder.deposit_cents, preorder.currency)}
          />
          <ControlData
            label="Balance"
            value={formatMoney(preorder.balance_cents, preorder.currency)}
          />
          <ControlData
            label="Allocation refund"
            value={formatMoney(preorder.allocation_refund_cents, preorder.currency)}
          />
          <ControlData label="Created" value={formatDate(preorder.created_at)} />
        </dl>
        <p className="mt-5 text-sm text-zinc-600">
          Allocation and refund decisions remain in the dedicated allocation workflow.
        </p>
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
