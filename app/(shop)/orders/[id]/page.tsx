import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/app/_components/page-header";
import { StatusBadge } from "@/app/_components/status-badge";
import { Timeline } from "@/app/_components/timeline";
import { buyAgainFromOrder } from "@/app/actions/cart";
import { getAppName } from "@/lib/app-config";
import { ApiError } from "@/lib/api/errors";
import { requireCustomer } from "@/lib/auth";
import { createSecretClient } from "@/lib/supabase";
import { getCustomerOrder } from "@/lib/orders";
import { formatMoney } from "@/lib/money";
import { reconcileOrderPayment } from "@/lib/payment-reconciliation";
import {
  formatDate,
  formatStatus,
  orderTimeline,
  paymentSummary,
  productHrefForItem,
  productNameForItem,
  type LiveOrder,
} from "@/lib/order-display";

type OrderPageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ checkout?: string; reorder?: string }>;
};

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: OrderPageProps) {
  const { id } = await params;
  return { title: `${id} | ${getAppName()}` };
}

export default async function OrderPage({
  params,
  searchParams,
}: OrderPageProps) {
  const { customer } = await requireCustomer("/orders");
  const { id } = await params;
  const query = (await searchParams) ?? {};
  const checkout = query.checkout;
  const supabase = createSecretClient();
  let order: LiveOrder | null = null;
  let dataError = false;

  try {
    order = (await getCustomerOrder(supabase, customer, id)) as LiveOrder;
  } catch (error) {
    if (error instanceof ApiError && error.code === "not_found") notFound();
    dataError = true;
    console.error("order detail query failed:", error instanceof Error ? error.message : "unknown");
  }

  if (checkout === "processing" && order?.status === "pending_payment") {
    try {
      await reconcileOrderPayment(supabase, id);
      order = (await getCustomerOrder(supabase, customer, id)) as LiveOrder;
    } catch (error) {
      console.error(
        "order payment reconciliation failed:",
        error instanceof Error ? error.message : "unknown",
      );
    }
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

      {query.reorder === "unavailable" ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          These items could not all be added. A product may be inactive or no longer have enough
          sellable stock. Your cart was not changed.
        </div>
      ) : null}
      {query.reorder === "cart-limit" ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          Your cart does not have room for every item in this order. Review the cart quantities and
          try again.
        </div>
      ) : null}

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
                  key={line.id ?? `${order.id}-${line.product_id}`}
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
            {(order.order_items ?? []).length > 0 ? (
              <form action={buyAgainFromOrder} className="grid gap-1">
                <input name="orderId" type="hidden" value={order.id} />
                <button className="inline-flex min-h-10 items-center justify-center rounded-md bg-zinc-950 px-4 text-sm font-semibold text-white hover:bg-emerald-700">
                  Buy these items again
                </button>
                <span className="max-w-sm text-xs leading-5 text-zinc-500">
                  Current prices, product status, stock, and cart limits are checked before anything
                  is added.
                </span>
              </form>
            ) : null}
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
