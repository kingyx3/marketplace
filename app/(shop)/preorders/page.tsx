import Link from "next/link";

import { PageHeader } from "@/app/_components/page-header";
import { StatusBadge } from "@/app/_components/status-badge";
import { Timeline } from "@/app/_components/timeline";
import { requireCustomer } from "@/lib/auth";
import { getCatalogProducts } from "@/lib/catalog";
import { formatMoney } from "@/lib/money";
import {
  formatDate,
  preorderStatusLabel,
  preorderStatusMessage,
  preorderTimeline,
  productHrefForItem,
  productNameForItem,
  type LivePreorder,
} from "@/lib/order-display";
import { createServiceClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const preorderSelect =
  "id, sku_id, channel, quantity, unit_price_cents, deposit_cents, balance_cents, allocation_refund_cents, allocation_confirmed_at, currency, status, allocated_qty, order_id, created_at, updated_at, booster_box_skus(sku, product_variants(products(slug, name))), payments(id, provider, provider_payment_id, kind, amount_cents, currency, status, captured_at, created_at)";

export default async function PreordersPage({
  searchParams,
}: {
  searchParams?: Promise<{ checkout?: string }>;
}) {
  const params = (await searchParams) ?? {};
  const { customer } = await requireCustomer("/preorders");
  const supabase = createServiceClient();
  let preorders: LivePreorder[] = [];
  let dataError = false;

  const { data, error } = await supabase
    .from("preorders")
    .select(preorderSelect)
    .eq("customer_id", customer.id)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) {
    dataError = true;
    console.error("preorders page query failed:", error.message);
  } else {
    preorders = (data ?? []) as unknown as LivePreorder[];
  }

  const preorderProducts = ((await getCatalogProducts()) ?? []).filter(
    (product) => product.setStatus === "preorder_open"
  );

  return (
    <div className="space-y-8">
      <PageHeader
        description="Preorders are paid in full at checkout. After supplier stock is confirmed, allocation is applied and any unallocated amount is refunded through Stripe."
        eyebrow="Preorders"
        title="Paid upfront, refunded for shortfalls"
      />

      {dataError ? (
        <div className="rounded-md border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          Preorders could not be loaded right now.
        </div>
      ) : null}
      {params.checkout === "processing" ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Payment is processing. Your fully paid preorder will appear after Stripe confirms it.
        </div>
      ) : null}

      <section className="grid gap-5 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-5">
          {preorders.length === 0 ? (
            <div className="rounded-lg border border-zinc-200 bg-white p-8 text-center shadow-sm">
              <h2 className="text-xl font-semibold text-zinc-950">No preorders yet</h2>
              <p className="mt-3 text-sm text-zinc-600">
                Fully paid preorders appear here after Stripe confirms payment.
              </p>
              <Link
                className="mt-6 inline-flex min-h-11 items-center justify-center rounded-md bg-zinc-950 px-5 text-sm font-semibold text-white hover:bg-emerald-700"
                href="/products"
              >
                Browse products
              </Link>
            </div>
          ) : (
            preorders.map((preorder) => {
              const href = productHrefForItem(preorder);
              const refundCents = Number(preorder.allocation_refund_cents ?? 0);
              return (
                <article
                  className="grid gap-5 rounded-lg border border-zinc-200 bg-white p-5 shadow-sm lg:grid-cols-[1fr_18rem]"
                  key={preorder.id}
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-3">
                      <h2 className="text-xl font-semibold text-zinc-950">
                        {productNameForItem(preorder)}
                      </h2>
                      <StatusBadge tone={preorderTone(preorder.status)}>
                        {preorderStatusLabel(preorder.status)}
                      </StatusBadge>
                    </div>
                    <p className="mt-2 text-sm text-zinc-500">
                      Preordered {formatDate(preorder.created_at)} · Quantity {preorder.quantity}
                    </p>
                    <p className="mt-4 text-sm leading-6 text-zinc-700">
                      {preorderStatusMessage(preorder)}
                    </p>
                    <dl className="mt-5 grid gap-4 sm:grid-cols-4">
                      <Value label="Requested" value={String(preorder.quantity)} />
                      <Value
                        label="Confirmed"
                        value={
                          ["allocated", "refund_pending", "converted", "refunded"].includes(
                            preorder.status
                          )
                            ? String(preorder.allocated_qty)
                            : "Pending"
                        }
                      />
                      <Value
                        label="Paid total"
                        value={formatMoney(preorder.deposit_cents, preorder.currency)}
                      />
                      <Value
                        label={refundCents > 0 ? "Allocation refund" : "Refund"}
                        value={
                          refundCents > 0
                            ? formatMoney(refundCents, preorder.currency)
                            : "Not required"
                        }
                        warning={refundCents > 0 && preorder.status === "refund_pending"}
                      />
                    </dl>
                    {refundCents > 0 ? (
                      <p className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
                        {preorder.status === "refund_pending"
                          ? "Stripe is processing the refund for the unallocated quantity."
                          : "The unallocated amount was submitted to Stripe for refund when allocation was confirmed."}
                      </p>
                    ) : null}
                    <div className="mt-5 flex flex-wrap gap-2">
                      <Link
                        className="inline-flex min-h-10 items-center justify-center rounded-md border border-zinc-300 px-4 text-sm font-semibold text-zinc-800 hover:border-zinc-500"
                        href={href ?? "/products"}
                      >
                        View product
                      </Link>
                      {preorder.order_id ? (
                        <Link
                          className="inline-flex min-h-10 items-center justify-center rounded-md border border-emerald-200 px-4 text-sm font-semibold text-emerald-800 hover:border-emerald-500"
                          href={`/orders/${preorder.order_id}`}
                        >
                          View allocated order
                        </Link>
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
          <p className="mt-2 text-xs leading-5 text-zinc-500">
            The displayed price is charged in full. Allocation shortfalls are refunded automatically after admin confirmation.
          </p>
          <div className="mt-5 grid gap-4">
            {preorderProducts.length === 0 ? (
              <p className="text-sm text-zinc-600">No preorder drops are open.</p>
            ) : (
              preorderProducts.map((product) => {
                const sku = product.skus[0];
                return (
                  <Link
                    className="rounded-md border border-zinc-200 p-4 hover:border-emerald-500"
                    href={`/products/${product.slug}`}
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

function Value({
  label,
  value,
  warning = false,
}: {
  label: string;
  value: string;
  warning?: boolean;
}) {
  return (
    <div>
      <dt className="text-sm text-zinc-500">{label}</dt>
      <dd className={`mt-1 font-semibold ${warning ? "text-amber-800" : "text-zinc-950"}`}>
        {value}
      </dd>
    </div>
  );
}

function preorderTone(status: string) {
  if (status === "refund_pending") return "warning" as const;
  if (["paid", "allocated", "converted"].includes(status)) return "success" as const;
  if (["cancelled", "refunded"].includes(status)) return "danger" as const;
  return "info" as const;
}
