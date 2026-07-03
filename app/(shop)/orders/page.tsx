import Link from "next/link";
import { PageHeader } from "@/app/_components/page-header";
import { StatusBadge } from "@/app/_components/status-badge";
import { Timeline } from "@/app/_components/timeline";
import { formatMoney, getProduct, orders } from "@/app/_data/marketplace-fixtures";
import { requireCustomer } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function OrdersPage() {
  await requireCustomer("/orders");

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Orders"
        title="Order history"
        description="Paid, packed, shipped, and delivered orders stay separated from preorder deposits and balance captures."
      />

      <section className="grid gap-5">
        {orders.map((order) => (
          <article
            key={order.id}
            className="grid gap-5 rounded-lg border border-zinc-200 bg-white p-5 shadow-sm lg:grid-cols-[1fr_18rem]"
          >
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-xl font-semibold text-zinc-950">{order.id}</h2>
                <StatusBadge tone={order.status === "delivered" ? "success" : "info"}>
                  {order.status}
                </StatusBadge>
                <StatusBadge tone="neutral">{order.channel.toUpperCase()}</StatusBadge>
              </div>
              <p className="mt-2 text-sm text-zinc-500">
                Placed {order.placedAt} / {order.itemCount} item
              </p>
              <div className="mt-5 grid gap-3">
                {order.lines.map((line) => {
                  const product = getProduct(line.productSlug);
                  return (
                    <div key={`${order.id}-${line.productSlug}`} className="flex justify-between gap-4">
                      <span className="text-sm text-zinc-700">{product?.name ?? line.productSlug}</span>
                      <span className="text-sm font-semibold text-zinc-950">x{line.quantity}</span>
                    </div>
                  );
                })}
              </div>
              <div className="mt-5 flex flex-wrap gap-2">
                <Link
                  href={`/orders/${order.id}`}
                  className="inline-flex min-h-10 items-center justify-center rounded-md bg-zinc-950 px-4 text-sm font-semibold text-white hover:bg-emerald-700"
                >
                  View order
                </Link>
                {order.trackingNumber ? (
                  <span className="inline-flex min-h-10 items-center rounded-md border border-zinc-300 px-4 text-sm font-medium text-zinc-700">
                    {order.carrier}: {order.trackingNumber}
                  </span>
                ) : null}
              </div>
            </div>

            <div className="rounded-md bg-zinc-50 p-4">
              <p className="text-sm text-zinc-500">Total</p>
              <p className="mt-1 text-2xl font-bold text-zinc-950">
                {formatMoney(order.totalCents, order.currency)}
              </p>
              <div className="mt-5">
                <Timeline items={order.timeline} />
              </div>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
