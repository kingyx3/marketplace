import { notFound } from "next/navigation";

import { ControlBackLink, ControlData } from "@/app/(shop)/control/_components/control-resource-ui";
import { PageHeader } from "@/app/_components/page-header";
import { StatusBadge } from "@/app/_components/status-badge";
import { requireControlPermission } from "@/lib/control-access";
import { formatMoney } from "@/lib/money";
import { createSecretClient } from "@/lib/supabase";
import { toOne } from "@/lib/supabase-relations";

export const dynamic = "force-dynamic";

export default async function PurchaseOrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ purchaseOrderId: string }>;
  searchParams?: Promise<{ saved?: string }>;
}) {
  const { purchaseOrderId } = await params;
  await requireControlPermission(
    "supply.view",
    `/control/supply/purchase-orders/${purchaseOrderId}`
  );
  const { data, error } = await createSecretClient()
    .from("purchase_orders")
    .select(
      "id, status, currency, placed_at, expected_at, total_cents, notes, created_at, suppliers(name), purchase_order_items(id, quantity, unit_cost_cents, received_quantity, booster_box_skus(sku))"
    )
    .eq("id", purchaseOrderId)
    .maybeSingle();
  if (error) throw new Error(`Purchase order lookup failed: ${error.message}`);
  if (!data) notFound();
  const supplier = toOne(data.suppliers);
  const items = data.purchase_order_items ?? [];
  const saved = (await searchParams)?.saved === "1";
  return (
    <div className="space-y-8">
      <PageHeader
        action={
          <>
            <StatusBadge tone="info">{data.status}</StatusBadge>
            <ControlBackLink href="/control/supply">Back to supply</ControlBackLink>
          </>
        }
        description={supplier?.name ?? "Unknown supplier"}
        eyebrow="Control · Purchase order"
        title={data.id}
      />
      <section className="grid gap-4 sm:grid-cols-4">
        <Summary label="Value" value={formatMoney(data.total_cents, data.currency)} />
        <Summary label="Placed" value={formatDate(data.placed_at ?? data.created_at)} />
        <Summary label="Expected" value={data.expected_at ?? "Unscheduled"} />
        <Summary label="Lines" value={String(items.length)} />
      </section>
      {saved ? (
        <div
          className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900"
          role="status"
        >
          Purchase order recorded and incoming inventory updated.
        </div>
      ) : null}
      <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
        <h2 className="font-semibold text-zinc-950">Committed items</h2>
        <div className="mt-4 divide-y divide-zinc-100">
          {items.map((item) => (
            <div className="grid gap-2 py-3 text-sm sm:grid-cols-[1fr_auto_auto]" key={item.id}>
              <span className="font-medium text-zinc-950">
                {toOne(item.booster_box_skus)?.sku ?? "Unknown SKU"}
              </span>
              <span>{item.quantity} ordered</span>
              <span>{item.received_quantity} received</span>
            </div>
          ))}
        </div>
        <p className="mt-4 text-sm text-zinc-600">{data.notes || "No notes recorded."}</p>
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
