import Link from "next/link";
import { PageHeader } from "@/app/_components/page-header";
import { StatusBadge } from "@/app/_components/status-badge";
import { Timeline } from "@/app/_components/timeline";
import {
  formatMoney,
  getProduct,
  marketplaceProducts,
  preorders,
} from "@/app/_data/marketplace-fixtures";
import { requireCustomer } from "@/lib/auth";

function preorderTone(status: string) {
  if (status === "balance_due") return "warning" as const;
  if (status === "allocated" || status === "paid" || status === "converted") return "success" as const;
  return "info" as const;
}

export const dynamic = "force-dynamic";

export default async function PreordersPage() {
  await requireCustomer("/preorders");
  const preorderProducts = marketplaceProducts.filter((product) => product.setStatus === "preorder_open");

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Preorders"
        title="Deposit now, balance after allocation"
        description="Preorders keep deposits, balance due, allocation quantity, and release timing visible from the customer dashboard."
        action={<StatusBadge tone="warning">Manual capture flow</StatusBadge>}
      />

      <section className="grid gap-5 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-5">
          {preorders.map((preorder) => {
            const product = getProduct(preorder.productSlug);
            return (
              <article
                key={preorder.id}
                className="grid gap-5 rounded-lg border border-zinc-200 bg-white p-5 shadow-sm lg:grid-cols-[1fr_18rem]"
              >
                <div>
                  <div className="flex flex-wrap items-center gap-3">
                    <h2 className="text-xl font-semibold text-zinc-950">{preorder.id}</h2>
                    <StatusBadge tone={preorderTone(preorder.status)}>
                      {preorder.status.replaceAll("_", " ")}
                    </StatusBadge>
                    <StatusBadge tone="neutral">Position {preorder.position}</StatusBadge>
                  </div>
                  <p className="mt-3 text-zinc-700">{product?.name ?? preorder.productSlug}</p>
                  <dl className="mt-5 grid gap-4 sm:grid-cols-4">
                    <div>
                      <dt className="text-sm text-zinc-500">Quantity</dt>
                      <dd className="mt-1 font-semibold text-zinc-950">{preorder.quantity}</dd>
                    </div>
                    <div>
                      <dt className="text-sm text-zinc-500">Allocated</dt>
                      <dd className="mt-1 font-semibold text-zinc-950">{preorder.allocatedQty}</dd>
                    </div>
                    <div>
                      <dt className="text-sm text-zinc-500">Deposit</dt>
                      <dd className="mt-1 font-semibold text-zinc-950">
                        {formatMoney(preorder.depositCents, preorder.currency)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-sm text-zinc-500">Balance</dt>
                      <dd className="mt-1 font-semibold text-zinc-950">
                        {formatMoney(preorder.balanceCents, preorder.currency)}
                      </dd>
                    </div>
                  </dl>
                  <div className="mt-5 flex flex-wrap gap-2">
                    <Link
                      href={product ? `/catalog/${product.slug}` : "/catalog"}
                      className="inline-flex min-h-10 items-center justify-center rounded-md border border-zinc-300 px-4 text-sm font-semibold text-zinc-800 hover:border-zinc-500"
                    >
                      View product
                    </Link>
                    {preorder.status === "balance_due" ? (
                      <Link
                        href="/cart"
                        className="inline-flex min-h-10 items-center justify-center rounded-md bg-zinc-950 px-4 text-sm font-semibold text-white hover:bg-emerald-700"
                      >
                        Pay balance
                      </Link>
                    ) : null}
                  </div>
                </div>
                <div className="rounded-md bg-zinc-50 p-4">
                  <Timeline items={preorder.timeline} />
                </div>
              </article>
            );
          })}
        </div>

        <aside className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-zinc-950">Open preorder drops</h2>
          <div className="mt-5 grid gap-4">
            {preorderProducts.map((product) => (
              <Link
                href={`/catalog/${product.slug}`}
                key={product.slug}
                className="rounded-md border border-zinc-200 p-4 hover:border-emerald-500"
              >
                <p className="font-semibold text-zinc-950">{product.name}</p>
                <p className="mt-2 text-sm text-zinc-500">
                  Reserve {product.preorderReserve}, cap {product.maxPerCustomer ?? "open"}
                </p>
                <p className="mt-3 text-lg font-bold text-zinc-950">
                  {formatMoney(product.priceCents, product.currency)}
                </p>
              </Link>
            ))}
          </div>
        </aside>
      </section>
    </div>
  );
}
