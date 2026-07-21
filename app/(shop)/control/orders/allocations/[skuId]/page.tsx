import {
  ControlActionForm,
  ControlBackLink,
  ControlSaveButton,
} from "@/app/(shop)/control/_components/control-resource-ui";
import { PageHeader } from "@/app/_components/page-header";
import { StatusBadge } from "@/app/_components/status-badge";
import { confirmPreorderAllocation } from "@/app/actions/preorder-allocation";
import { requireControlPermission } from "@/lib/control-access";
import { formatMoney } from "@/lib/money";
import { previewPreorderAllocationForSku } from "@/lib/preorders";
import { createServiceClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function AllocationPage({
  params,
  searchParams,
}: {
  params: Promise<{ skuId: string }>;
  searchParams?: Promise<{ error?: string }>;
}) {
  const { skuId } = await params;
  await requireControlPermission("preorders.allocate", `/control/orders/allocations/${skuId}`);
  await requireControlPermission("refunds.manage", `/control/orders/allocations/${skuId}`);
  const preview = await previewPreorderAllocationForSku(createServiceClient(), skuId);
  const error = (await searchParams)?.error;
  return (
    <div className="space-y-8">
      <PageHeader
        action={
          <>
            <StatusBadge tone={preview.refundCents > 0 ? "warning" : "success"}>
              {preview.refundCents > 0 ? "Refunds required" : "Fully allocated"}
            </StatusBadge>
            <ControlBackLink href="/control/orders/allocations">Back to queues</ControlBackLink>
          </>
        }
        description={`${preview.sku} · Review the FIFO plan before confirming.`}
        eyebrow="Control · Allocation"
        title={preview.productName}
      />
      {error ? <ErrorMessage code={error} /> : null}
      <dl className="grid gap-4 sm:grid-cols-4">
        <Metric label="Available" value={String(preview.availableQty)} />
        <Metric label="Requested" value={String(preview.requestedQty)} />
        <Metric label="Allocated" value={String(preview.allocatedQty)} />
        <Metric label="HitPay refunds" value={formatMoney(preview.refundCents, preview.currency)} />
      </dl>
      <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
        <table className="min-w-full divide-y divide-zinc-200 text-sm">
          <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Preorder</th>
              <th className="px-4 py-3 text-right">Requested</th>
              <th className="px-4 py-3 text-right">Allocated</th>
              <th className="px-4 py-3 text-right">Refund</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {preview.rows.map((row) => (
              <tr key={row.preorderId}>
                <td className="px-4 py-3 font-medium text-zinc-950">{row.customerLabel}</td>
                <td className="px-4 py-3 font-mono text-xs text-zinc-500">{row.preorderId}</td>
                <td className="px-4 py-3 text-right">{row.requestedQty}</td>
                <td className="px-4 py-3 text-right font-semibold">{row.allocatedQty}</td>
                <td className="px-4 py-3 text-right">
                  {row.refundCents > 0 ? (
                    <span className="font-semibold text-rose-700">
                      {formatMoney(row.refundCents, row.currency)}
                    </span>
                  ) : (
                    <span className="text-zinc-400">None</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ControlActionForm
        action={confirmPreorderAllocation}
        className="rounded-lg border border-amber-200 bg-amber-50 p-5"
        confirmation={{
          title: "Finalize allocation and refunds?",
          description: `This finalizes ${preview.allocatedQty} allocated units and creates ${formatMoney(preview.refundCents, preview.currency)} in HitPay refunds. The reviewed fingerprint must still match.`,
          confirmLabel: "Finalize allocation",
          requireText: "ALLOCATE",
          tone: "danger",
        }}
        errorMessage="The allocation could not be finalized. The preview remains open; refresh it before retrying."
        successMessage="Allocation finalized and required refunds submitted."
      >
        <input name="skuId" type="hidden" value={preview.skuId} />
        <input name="fingerprint" type="hidden" value={preview.fingerprint} />
        <label className="flex items-start gap-3 text-sm text-amber-950">
          <input className="mt-1" name="confirm" required type="checkbox" value="yes" />
          <span>
            <strong>I confirm this allocation.</strong> This creates orders for allocated quantities
            and sends HitPay refunds for every unallocated unit.
          </span>
        </label>
        <div className="mt-4">
          <ControlSaveButton pendingLabel="Finalizing allocation…">
            Confirm allocation and refunds
          </ControlSaveButton>
        </div>
      </ControlActionForm>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-white p-4 shadow-sm">
      <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">{label}</dt>
      <dd className="mt-2 text-2xl font-bold text-zinc-950">{value}</dd>
    </div>
  );
}
function ErrorMessage({ code }: { code: string }) {
  const messages: Record<string, string> = {
    "confirmation-required": "Confirm the allocation and refund effects before submitting.",
    "stale-preview":
      "Stock or the preorder queue changed. Review the refreshed allocation before confirming again.",
    "refund-failed": "HitPay did not confirm every required refund. Review HitPay before retrying.",
    "payment-missing":
      "A preorder is missing its captured full-payment record and cannot be allocated.",
    "allocation-failed": "The allocation could not be completed.",
  };
  return (
    <div className="rounded-md border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
      {messages[code] ?? messages["allocation-failed"]}
    </div>
  );
}
