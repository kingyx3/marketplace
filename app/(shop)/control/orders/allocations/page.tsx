import Link from "next/link";

import { ControlEmptyState } from "@/app/(shop)/control/_components/control-resource-ui";
import { PageHeader } from "@/app/_components/page-header";
import { StatusBadge } from "@/app/_components/status-badge";
import { requireControlPermission } from "@/lib/control-access";
import { formatMoney } from "@/lib/money";
import { listPreorderAllocationProducts } from "@/lib/preorders";
import { createSecretClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function ControlPreorderAllocationPage({
  searchParams,
}: {
  searchParams?: Promise<{ success?: string }>;
}) {
  await requireControlPermission("preorders.allocate", "/control/orders/allocations");
  await requireControlPermission("refunds.manage", "/control/orders/allocations");
  const params = (await searchParams) ?? {};
  const options = await listPreorderAllocationProducts(createSecretClient());

  return (
    <div className="space-y-8">
      <PageHeader
        action={<StatusBadge tone="warning">Admin confirmation required</StatusBadge>}
        description="Choose a product queue to open its FIFO allocation preview and refund confirmation in a modal."
        eyebrow="Control"
        title="Preorder allocation"
      />

      {params.success ? <SuccessMessage value={params.success} /> : null}

      {options.length === 0 ? (
        <ControlEmptyState
          description="Only fully paid retail preorders awaiting allocation appear here."
          title="No allocation queues"
        />
      ) : (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-zinc-950">Allocation queues</h2>
              <p className="mt-1 text-sm text-zinc-600">
                Open one record to preview the irreversible effects.
              </p>
            </div>
            <Link className="text-sm font-semibold text-emerald-700" href="/control/supply">
              Open inventory
            </Link>
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            {options.map((option) => (
              <Link
                className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm transition hover:border-emerald-500 hover:shadow-md"
                href={`/control/orders/allocations/${option.productId}`}
                key={option.productId}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold text-zinc-950">{option.productName}</h3>
                    <p className="mt-1 font-mono text-xs text-zinc-500">{option.referenceCode}</p>
                  </div>
                  <StatusBadge tone="warning">{option.preorderCount} waiting</StatusBadge>
                </div>
                <p className="mt-4 text-sm font-semibold text-emerald-700">Review allocation →</p>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function SuccessMessage({ value }: { value: string }) {
  const [finalized = "0", refunds = "0", cents = "0"] = value.split("-");
  return (
    <div className="rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
      Allocation completed for {finalized} preorder{finalized === "1" ? "" : "s"}. HitPay accepted{" "}
      {refunds} refund{refunds === "1" ? "" : "s"} totalling {formatMoney(Number(cents), "SGD")}.
    </div>
  );
}
