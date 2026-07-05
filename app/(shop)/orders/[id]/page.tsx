import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/app/_components/page-header";
import { StatusBadge } from "@/app/_components/status-badge";
import { Timeline } from "@/app/_components/timeline";
import { getAppName } from "@/lib/app-config";
import { ApiError } from "@/lib/api/errors";
import { requireCustomer } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase";
import { getCustomerOrder } from "@/lib/orders";
import { formatMoney } from "@/lib/money";
import {
  formatDate,
  formatStatus,
  orderTimeline,
  paymentSummary,
  productHrefForItem,
  productNameForItem,
  skuForItem,
  type LiveOrder,
} from "@/lib/order-display";

type OrderPageProps = {
  params: Promise<{ id: string }>;
};

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: OrderPageProps) {
  const { id } = await params;
  return { title: `${id} | ${getAppName()}` };
}

export default async function OrderPage({ params }: OrderPageProps) {
  const { customer } = await requireCustomer("/orders");
  const { id } = await params;
  const supabase = createServiceClient();
  let order: LiveOrder | null = null;
  let dataError = false;

  try {
    order = (await getCustomerOrder(supabase, customer, id)) as LiveOrder;
  } catch (error) {
    if (error instanceof ApiError && error.code === "not_found") notFound();
    dataError = true;
    console.error("order detail query failed:", error instanceof Error ? error.message : "unknown");
  }

  if (!order) {
    return (
      <div className="space-y-8">
        <PageHeader
          description="Order activity could not be loaded right now."
          eyebrow="Order detail"
          title={id}
        />
        {dataError ? (
          <div className="rounded-md border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
            Order activity could not be loaded right now.
          </div>
        ) : null}
      </div>
    );
  }

  const payment = paymentSummary(order);

  return (
    <div className="space-y-8">
      <PageHeader
        action={
          <StatusBadge tone={orderTone(order.status)}>{formatStatus(order.status)}</StatusBadge>
        }
        description={`Placed ${formatDate(order.placed_at ?? order.created_at)}. Payment, fulfillment, and shipment state are kept auditable.`}
        eyebrow="Order detail"
        title={order.id}
      />

      <section className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="text-xl font-semibold text-zinc-950">Items</h2>
          <div className="mt-5 grid gap-4">
            {(order.order_items ?? []).map((line) => {
              const href = productHrefForItem(line);
              const name = productNameForItem(line);
              return (
                <div
                  className="grid gap-3 border-b border-zinc-100 pb-4 sm:grid-cols-[1fr_auto]"
                  key={line.id ?? `${order.id}-${line.sku_id}`}
                >
                  <div>
                    {href ? (
                      <Link
                        className="font-semibold text-zinc-950 hover:text-emerald-700"
                        href={href}
                      >
                        {name}
                      </Link>
                    ) : (
                      <p className="font-semibold text-zinc-950">{name}</p>
                    )}
                    <p className="mt-1 text-sm text-zinc-500">{skuForItem(line) ?? line.sku_id}</p>
                  </div>
                  <div className="text-left sm:text-right">
                    <p className="font-semibold text-zinc-950">x{line.quantity}</p>
                    <p className="mt-1 text-sm text-zinc-500">
                      {formatMoney(line.unit_price_cents * line.quantity, order.currency)}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-6 flex flex-wrap gap-2">
            <Link
              className="inline-flex min-h-10 items-center justify-center rounded-md border border-zinc-300 px-4 text-sm font-semibold text-zinc-800 hover:border-zinc-500"
              href="/orders"
            >
              Back to orders
            </Link>
          </div>
        </div>

        <aside className="space-y-5">
          <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-zinc-950">Timeline</h2>
            <div className="mt-5">
              <Timeline items={orderTimeline(order)} />
            </div>
          </section>
          <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-zinc-950">Payment</h2>
            <p className="mt-3 text-3xl font-bold text-zinc-950">
              {formatMoney(order.total_cents, order.currency)}
            </p>
            <p className="mt-2 text-sm text-zinc-500">
              {payment ? formatStatus(payment.status ?? "pending") : "Pending"}
            </p>
          </section>
        </aside>
      </section>
    </div>
  );
}

function orderTone(status: string) {
  if (["paid", "packing", "shipped", "delivered"].includes(status)) return "success" as const;
  if (["cancelled", "refunded"].includes(status)) return "danger" as const;
  if (status === "pending_payment") return "warning" as const;
  return "info" as const;
}
