import Link from "next/link";
import { PageHeader } from "@/app/_components/page-header";
import { StatusBadge } from "@/app/_components/status-badge";
import { Timeline } from "@/app/_components/timeline";
import { requireCustomer } from "@/lib/auth";
import { getCatalogProducts } from "@/lib/catalog";
import { createServiceClient } from "@/lib/supabase";
import { listCustomerPreorders } from "@/lib/orders";
import { formatMoney } from "@/lib/money";
import {
  formatDate,
  formatStatus,
  preorderTimeline,
  productHrefForItem,
  productNameForItem,
  skuForItem,
  type LivePreorder,
} from "@/lib/order-display";

export const dynamic = "force-dynamic";

export default async function PreordersPage() {
  const { customer } = await requireCustomer("/preorders");
  const supabase = createServiceClient();
  let preorders: LivePreorder[] = [];
  let dataError = false;

  try {
    preorders = (await listCustomerPreorders(supabase, customer, 50)) as LivePreorder[];
  } catch (error) {
    dataError = true;
    console.error(
      "preorders page query failed:",
      error instanceof Error ? error.message : "unknown"
    );
  }

  const preorderProducts = ((await getCatalogProducts()) ?? []).filter(
    (product) => product.setStatus === "preorder_open"
  );

  return (
    <div className="space-y-8">
      <PageHeader
        action={<StatusBadge tone="warning">Manual capture flow</StatusBadge>}
        description="Preorders keep deposits, balance due, allocation quantity, and release timing visible from the customer dashboard."
        eyebrow="Preorders"
        title="Deposit now, balance after allocation"
      />

      {dataError ? (
        <div className="rounded-md border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          Preorders could not be loaded right now.
        </div>
      ) : null}

      <section className="grid gap-5 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-5">
          {preorders.length === 0 ? (
            <div className="rounded-lg border border-zinc-200 bg-white p-8 text-center shadow-sm">
              <h2 className="text-xl font-semibold text-zinc-950">No preorders yet</h2>
              <p className="mt-3 text-sm text-zinc-600">
                Deposit-backed preorders appear here after payment starts.
              </p>
              <Link
                className="mt-6 inline-flex min-h-11 items-center justify-center rounded-md bg-zinc-950 px-5 text-sm font-semibold text-white hover:bg-emerald-700"
                href="/catalog"
              >
                Browse catalog
              </Link>
            </div>
          ) : (
            preorders.map((preorder) => {
              const href = productHrefForItem(preorder);
              return (
                <article
                  className="grid gap-5 rounded-lg border border-zinc-200 bg-white p-5 shadow-sm lg:grid-cols-[1fr_18rem]"
                  key={preorder.id}
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-3">
                      <h2 className="text-xl font-semibold text-zinc-950">{preorder.id}</h2>
                      <StatusBadge tone={preorderTone(preorder.status)}>
                        {formatStatus(preorder.status)}
                      </StatusBadge>
                      <StatusBadge tone="neutral">{preorder.channel.toUpperCase()}</StatusBadge>
                    </div>
                    <p className="mt-3 text-zinc-700">{productNameForItem(preorder)}</p>
                    <p className="mt-1 text-sm text-zinc-500">
                      {skuForItem(preorder) ?? preorder.sku_id} / Created{" "}
                      {formatDate(preorder.created_at)}
                    </p>
                    <dl className="mt-5 grid gap-4 sm:grid-cols-4">
                      <div>
                        <dt className="text-sm text-zinc-500">Quantity</dt>
                        <dd className="mt-1 font-semibold text-zinc-950">{preorder.quantity}</dd>
                      </div>
                      <div>
                        <dt className="text-sm text-zinc-500">Allocated</dt>
                        <dd className="mt-1 font-semibold text-zinc-950">
                          {preorder.allocated_qty}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-sm text-zinc-500">Deposit</dt>
                        <dd className="mt-1 font-semibold text-zinc-950">
                          {formatMoney(preorder.deposit_cents, preorder.currency)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-sm text-zinc-500">Balance</dt>
                        <dd className="mt-1 font-semibold text-zinc-950">
                          {formatMoney(preorder.balance_cents, preorder.currency)}
                        </dd>
                      </div>
                    </dl>
                    <div className="mt-5 flex flex-wrap gap-2">
                      <Link
                        className="inline-flex min-h-10 items-center justify-center rounded-md border border-zinc-300 px-4 text-sm font-semibold text-zinc-800 hover:border-zinc-500"
                        href={href ?? "/catalog"}
                      >
                        View product
                      </Link>
                      {preorder.status === "balance_due" ? (
                        <span className="inline-flex min-h-10 items-center rounded-md border border-amber-200 px-4 text-sm font-semibold text-amber-800">
                          Balance flow pending
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <div className="rounded-md bg-zinc-50 p-4">
                    <Timeline items={preorderTimeline(preorder)} />
                  </div>
                </article>
              );
            })
          )}
        </div>

        <aside className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-zinc-950">Open preorder drops</h2>
          <div className="mt-5 grid gap-4">
            {preorderProducts.length === 0 ? (
              <p className="text-sm text-zinc-600">No preorder drops are open.</p>
            ) : (
              preorderProducts.map((product) => {
                const sku = product.skus[0];
                return (
                  <Link
                    className="rounded-md border border-zinc-200 p-4 hover:border-emerald-500"
                    href={`/catalog/${product.slug}`}
                    key={product.slug}
                  >
                    <p className="font-semibold text-zinc-950">{product.name}</p>
                    <p className="mt-2 text-sm text-zinc-500">
                      {product.setName ?? product.setCode ?? "Upcoming release"}
                    </p>
                    {sku ? (
                      <p className="mt-3 text-lg font-bold text-zinc-950">
                        {formatMoney(sku.priceCents, sku.currency)}
                      </p>
                    ) : null}
                  </Link>
                );
              })
            )}
          </div>
        </aside>
      </section>
    </div>
  );
}

function preorderTone(status: string) {
  if (status === "balance_due") return "warning" as const;
  if (["allocated", "paid", "converted"].includes(status)) return "success" as const;
  if (["cancelled", "refunded"].includes(status)) return "danger" as const;
  return "info" as const;
}
