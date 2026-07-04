import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/app/_components/page-header";
import { StatusBadge } from "@/app/_components/status-badge";
import { Timeline } from "@/app/_components/timeline";
import { formatMoney, getOrder, getProduct } from "@/app/_data/marketplace-fixtures";
import { requireCustomer } from "@/lib/auth";

type OrderPageProps = {
  params: Promise<{ id: string }>;
};

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: OrderPageProps) {
  const { id } = await params;
  return { title: `${id} | Marketplace` };
}

export default async function OrderPage({ params }: OrderPageProps) {
  await requireCustomer("/orders");
  const { id } = await params;
  const order = getOrder(id);
  if (!order) notFound();

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Order detail"
        title={order.id}
        description={`Placed ${order.placedAt}. Payment, fulfillment, and shipment state are kept auditable.`}
        action={<StatusBadge tone={order.status === "delivered" ? "success" : "info"}>{order.status}</StatusBadge>}
      />

      <section className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="text-xl font-semibold text-zinc-950">Items</h2>
          <div className="mt-5 grid gap-4">
            {order.lines.map((line) => {
              const product = getProduct(line.productSlug);
              return (
                <div
                  key={`${order.id}-${line.productSlug}`}
                  className="grid gap-3 border-b border-zinc-100 pb-4 sm:grid-cols-[1fr_auto]"
                >
                  <div>
                    <p className="font-semibold text-zinc-950">{product?.name ?? line.productSlug}</p>
                    <p className="mt-1 text-sm text-zinc-500">{product?.sku}</p>
                  </div>
                  <div className="text-left sm:text-right">
                    <p className="font-semibold text-zinc-950">x{line.quantity}</p>
                    <p className="mt-1 text-sm text-zinc-500">
                      {product ? formatMoney(product.priceCents * line.quantity, product.currency) : null}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-6 flex flex-wrap gap-2">
            <Link
              href="/orders"
              className="inline-flex min-h-10 items-center justify-center rounded-md border border-zinc-300 px-4 text-sm font-semibold text-zinc-800 hover:border-zinc-500"
            >
              Back to orders
            </Link>
          </div>
        </div>

        <aside className="space-y-5">
          <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-zinc-950">Timeline</h2>
            <div className="mt-5">
              <Timeline items={order.timeline} />
            </div>
          </section>
          <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-zinc-950">Payment</h2>
            <p className="mt-3 text-3xl font-bold text-zinc-950">
              {formatMoney(order.totalCents, order.currency)}
            </p>
            <p className="mt-2 text-sm text-zinc-500">Captured through Stripe</p>
          </section>
        </aside>
      </section>
    </div>
  );
}
