import Link from "next/link";
import { MetricCard } from "@/app/_components/metric-card";
import { PageHeader } from "@/app/_components/page-header";
import { StatusBadge } from "@/app/_components/status-badge";
import { runPreorderAllocation, updateInventory } from "@/app/actions/admin";
import {
  adminMetrics,
  adminWorkQueue,
  formatMoney,
  purchaseOrders,
} from "@/app/_data/marketplace-fixtures";
import { requireStaff } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase";

interface AdminInventoryRow {
  skuId: string;
  sku: string;
  productName: string;
  onHand: number;
  incoming: number;
  allocated: number;
  safetyStock: number;
  available: number;
}

function queueTone(status: string) {
  if (status === "Blocked") return "danger" as const;
  if (status === "Today" || status === "Needs action") return "warning" as const;
  return "info" as const;
}

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const { staff } = await requireStaff("/admin");
  const inventoryRows = await fetchInventoryRows();

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Admin"
        title="Operator workspace"
        description="Inventory, purchase orders, allocation queues, and wholesale reviews share one operational surface for sealed-product fulfillment."
        action={<StatusBadge tone="success">Staff verified: {staff.role}</StatusBadge>}
      />

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {adminMetrics.map((metric) => (
          <MetricCard key={metric.label} {...metric} />
        ))}
      </section>

      <section className="grid gap-6 lg:grid-cols-[1fr_24rem]">
        <div className="space-y-6">
          <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-xl font-semibold text-zinc-950">Inventory</h2>
              <Link
                href="/catalog"
                className="text-sm font-semibold text-emerald-700 hover:text-emerald-900"
              >
                Open catalog
              </Link>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="border-b border-zinc-200 text-zinc-500">
                  <tr>
                    <th className="py-3 pr-4 font-medium">Product</th>
                    <th className="py-3 pr-4 font-medium">SKU</th>
                    <th className="py-3 pr-4 font-medium">Stock update</th>
                    <th className="py-3 pr-4 font-medium">Incoming</th>
                    <th className="py-3 pr-4 font-medium">Allocated</th>
                    <th className="py-3 pr-4 font-medium">Available</th>
                    <th className="py-3 pr-4 font-medium">Preorders</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {inventoryRows.map((row) => (
                    <tr key={row.skuId}>
                      <td className="py-4 pr-4 font-semibold text-zinc-950">{row.productName}</td>
                      <td className="py-4 pr-4 text-zinc-600">{row.sku}</td>
                      <td className="py-4 pr-4 text-zinc-600">
                        <form
                          action={updateInventory}
                          className="flex flex-wrap items-center gap-2"
                        >
                          <input type="hidden" name="skuId" value={row.skuId} />
                          <input
                            className="h-10 w-20 rounded-md border border-zinc-300 px-2"
                            aria-label={`${row.sku} on hand`}
                            defaultValue={row.onHand}
                            min={0}
                            name="onHand"
                            type="number"
                          />
                          <input
                            className="h-10 w-20 rounded-md border border-zinc-300 px-2"
                            aria-label={`${row.sku} incoming`}
                            defaultValue={row.incoming}
                            min={0}
                            name="incoming"
                            type="number"
                          />
                          <input
                            className="h-10 w-20 rounded-md border border-zinc-300 px-2"
                            aria-label={`${row.sku} safety stock`}
                            defaultValue={row.safetyStock}
                            min={0}
                            name="safetyStock"
                            type="number"
                          />
                          <button className="h-10 rounded-md bg-zinc-950 px-3 text-xs font-semibold text-white hover:bg-emerald-700">
                            Save
                          </button>
                        </form>
                      </td>
                      <td className="py-4 pr-4 text-zinc-600">{row.incoming}</td>
                      <td className="py-4 pr-4 text-zinc-600">{row.allocated}</td>
                      <td className="py-4 pr-4">
                        <StatusBadge tone={row.available > 0 ? "success" : "warning"}>
                          {row.available}
                        </StatusBadge>
                      </td>
                      <td className="py-4 pr-4">
                        <form action={runPreorderAllocation}>
                          <input type="hidden" name="skuId" value={row.skuId} />
                          <button className="min-h-10 rounded-md border border-zinc-300 px-3 text-xs font-semibold text-zinc-800 hover:border-emerald-600 hover:text-emerald-700">
                            Allocate
                          </button>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
            <h2 className="text-xl font-semibold text-zinc-950">Purchase orders</h2>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              {purchaseOrders.map((po) => (
                <article key={po.id} className="rounded-md border border-zinc-200 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h3 className="font-semibold text-zinc-950">{po.id}</h3>
                    <StatusBadge tone={po.status === "confirmed" ? "success" : "info"}>
                      {po.status}
                    </StatusBadge>
                  </div>
                  <dl className="mt-4 grid gap-3 text-sm">
                    <div className="flex justify-between gap-4">
                      <dt className="text-zinc-500">Supplier</dt>
                      <dd className="font-semibold text-zinc-950">{po.supplier}</dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="text-zinc-500">Expected</dt>
                      <dd className="font-semibold text-zinc-950">{po.expectedAt}</dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="text-zinc-500">Boxes</dt>
                      <dd className="font-semibold text-zinc-950">{po.boxes}</dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="text-zinc-500">Value</dt>
                      <dd className="font-semibold text-zinc-950">
                        {formatMoney(po.valueCents, po.currency)}
                      </dd>
                    </div>
                  </dl>
                </article>
              ))}
            </div>
          </section>
        </div>

        <aside className="space-y-5">
          <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-zinc-950">Work queue</h2>
            <div className="mt-5 grid gap-3">
              {adminWorkQueue.map((item) => (
                <article key={item.title} className="rounded-md border border-zinc-200 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h3 className="font-semibold text-zinc-950">{item.title}</h3>
                    <StatusBadge tone={queueTone(item.status)}>{item.status}</StatusBadge>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-zinc-600">{item.detail}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-zinc-950">Allocation controls</h2>
            <div className="mt-5 grid gap-3">
              <button className="min-h-11 rounded-md bg-zinc-950 px-4 text-sm font-semibold text-white hover:bg-emerald-700">
                Run allocation
              </button>
              <button className="min-h-11 rounded-md border border-zinc-300 px-4 text-sm font-semibold text-zinc-800 hover:border-zinc-500">
                Export preorder queue
              </button>
              <button className="min-h-11 rounded-md border border-zinc-300 px-4 text-sm font-semibold text-zinc-800 hover:border-zinc-500">
                Review B2B applications
              </button>
            </div>
          </section>
        </aside>
      </section>
    </div>
  );
}

async function fetchInventoryRows(): Promise<AdminInventoryRow[]> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("inventory")
    .select(
      "sku_id, on_hand, incoming, allocated, safety_stock, available, booster_box_skus(sku, product_variants(products(name)))"
    )
    .eq("location", "main")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Admin inventory query failed: ${error.message}`);
  }

  return (
    (data ?? []) as unknown as Array<{
      sku_id: string;
      on_hand: number;
      incoming: number;
      allocated: number;
      safety_stock: number;
      available: number;
      booster_box_skus: {
        sku: string;
        product_variants: { products: { name: string } | null } | null;
      } | null;
    }>
  ).map((row) => ({
    skuId: row.sku_id,
    sku: row.booster_box_skus?.sku ?? row.sku_id,
    productName: row.booster_box_skus?.product_variants?.products?.name ?? "Unknown product",
    onHand: row.on_hand,
    incoming: row.incoming,
    allocated: row.allocated,
    safetyStock: row.safety_stock,
    available: row.available,
  }));
}
