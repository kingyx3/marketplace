import Link from "next/link";

import { PageHeader } from "@/app/_components/page-header";
import { StatusBadge } from "@/app/_components/status-badge";
import { confirmPreorderAllocation } from "@/app/actions/preorder-allocation";
import { requireControlPermission } from "@/lib/control-access";
import { formatMoney } from "@/lib/money";
import {
  listPreorderAllocationSkus,
  previewPreorderAllocationForSku,
  type PreorderAllocationPreview,
} from "@/lib/preorders";
import { createServiceClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function ControlPreorderAllocationPage({
  searchParams,
}: {
  searchParams?: Promise<{ sku?: string; success?: string; error?: string }>;
}) {
  await requireControlPermission("manage_full_operations", "/control/preorders");
  const params = (await searchParams) ?? {};
  const supabase = createServiceClient();
  const options = await listPreorderAllocationSkus(supabase);
  const selectedSkuId = params.sku ?? options[0]?.skuId ?? "";
  let preview: PreorderAllocationPreview | null = null;
  let previewError: string | null = null;

  if (selectedSkuId) {
    try {
      preview = await previewPreorderAllocationForSku(supabase, selectedSkuId);
    } catch (error) {
      previewError = error instanceof Error ? error.message : "Allocation preview could not be loaded";
    }
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Control"
        title="Preorder allocation"
        description="Review the FIFO allocation plan, confirm it once, and issue Stripe refunds automatically for every unallocated unit."
        action={<StatusBadge tone="warning">Admin confirmation required</StatusBadge>}
      />

      {params.success ? <SuccessMessage value={params.success} /> : null}
      {params.error ? <ErrorMessage code={params.error} /> : null}

      <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-zinc-950">Allocation queue</h2>
            <p className="mt-1 text-sm text-zinc-600">
              Only fully paid retail preorders appear here. Normal orders are never allocated through this workflow.
            </p>
          </div>
          <Link
            className="inline-flex min-h-10 items-center rounded-md border border-zinc-300 px-4 text-sm font-semibold text-zinc-800 hover:border-emerald-600"
            href="/control/operations"
          >
            Open inventory
          </Link>
        </div>

        {options.length === 0 ? (
          <p className="mt-6 rounded-md border border-dashed border-zinc-300 p-5 text-sm text-zinc-600">
            No fully paid preorders are awaiting allocation.
          </p>
        ) : (
          <form className="mt-6 flex flex-wrap items-end gap-3" method="get">
            <label className="grid min-w-72 flex-1 gap-1 text-xs font-medium text-zinc-600">
              SKU queue
              <select
                className="min-h-11 rounded-md border border-zinc-300 px-3 text-sm"
                defaultValue={selectedSkuId}
                name="sku"
              >
                {options.map((option) => (
                  <option key={option.skuId} value={option.skuId}>
                    {option.productName} · {option.sku} · {option.preorderCount} preorder
                    {option.preorderCount === 1 ? "" : "s"}
                  </option>
                ))}
              </select>
            </label>
            <button className="min-h-11 rounded-md bg-zinc-950 px-4 text-sm font-semibold text-white hover:bg-emerald-700">
              Review allocation
            </button>
          </form>
        )}
      </section>

      {previewError ? (
        <div className="rounded-md border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          {previewError}
        </div>
      ) : null}
      {preview ? <AllocationPreview preview={preview} /> : null}
    </div>
  );
}

function AllocationPreview({ preview }: { preview: PreorderAllocationPreview }) {
  return (
    <section className="space-y-6 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-emerald-700">{preview.sku}</p>
          <h2 className="mt-1 text-2xl font-semibold text-zinc-950">{preview.productName}</h2>
        </div>
        <StatusBadge tone={preview.refundCents > 0 ? "warning" : "success"}>
          {preview.refundCents > 0 ? "Refunds required" : "Fully allocated"}
        </StatusBadge>
      </div>

      <dl className="grid gap-4 sm:grid-cols-4">
        <Metric label="Available" value={String(preview.availableQty)} />
        <Metric label="Requested" value={String(preview.requestedQty)} />
        <Metric label="Allocated" value={String(preview.allocatedQty)} />
        <Metric label="Stripe refunds" value={formatMoney(preview.refundCents, preview.currency)} />
      </dl>

      <div className="overflow-x-auto rounded-lg border border-zinc-200">
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

      <form action={confirmPreorderAllocation} className="rounded-lg border border-amber-200 bg-amber-50 p-4">
        <input name="skuId" type="hidden" value={preview.skuId} />
        <input name="fingerprint" type="hidden" value={preview.fingerprint} />
        <label className="flex items-start gap-3 text-sm text-amber-950">
          <input className="mt-1" name="confirm" required type="checkbox" value="yes" />
          <span>
            <strong>I confirm this allocation.</strong> This creates orders for allocated quantities and sends Stripe refunds for every unallocated unit. The preview is rejected if stock or the queue changes before submission.
          </span>
        </label>
        <button className="mt-4 min-h-11 rounded-md bg-zinc-950 px-5 text-sm font-semibold text-white hover:bg-emerald-700">
          Confirm allocation and refunds
        </button>
      </form>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-zinc-50 p-4">
      <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">{label}</dt>
      <dd className="mt-2 text-2xl font-bold text-zinc-950">{value}</dd>
    </div>
  );
}

function SuccessMessage({ value }: { value: string }) {
  const [finalized = "0", refunds = "0", cents = "0"] = value.split("-");
  return (
    <div className="rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
      Allocation completed for {finalized} preorder{finalized === "1" ? "" : "s"}. Stripe accepted {refunds} refund{refunds === "1" ? "" : "s"} totalling {formatMoney(Number(cents), "SGD")}.
    </div>
  );
}

function ErrorMessage({ code }: { code: string }) {
  const messages: Record<string, string> = {
    "confirmation-required": "Confirm the allocation and refund effects before submitting.",
    "stale-preview": "Stock or the preorder queue changed. Review the refreshed allocation before confirming again.",
    "refund-failed": "Stripe did not confirm every required refund. The staged allocation remains retryable; submit the same queue again after reviewing Stripe.",
    "payment-missing": "A preorder is missing its captured full-payment record and cannot be allocated.",
    "allocation-failed": "The allocation could not be completed. No unstaged allocation was applied.",
  };
  return (
    <div className="rounded-md border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
      {messages[code] ?? messages["allocation-failed"]}
    </div>
  );
}
