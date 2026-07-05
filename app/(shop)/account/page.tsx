import Link from "next/link";
import { MetricCard } from "@/app/_components/metric-card";
import { PageHeader } from "@/app/_components/page-header";
import { StatusBadge } from "@/app/_components/status-badge";
import { requireCustomer } from "@/lib/auth";
import { getAppName } from "@/lib/app-config";
import { createServiceClient } from "@/lib/supabase";
import { listCustomerOrders, listCustomerPreorders } from "@/lib/orders";
import { formatMoney } from "@/lib/money";
import {
  formatDate,
  formatStatus,
  orderItemCount,
  productNameForItem,
  type LiveOrder,
  type LivePreorder,
} from "@/lib/order-display";

export const dynamic = "force-dynamic";

export default async function AccountPage({
  searchParams,
}: {
  searchParams?: Promise<{ welcome?: string }>;
}) {
  const params = (await searchParams) ?? {};
  const appName = getAppName();
  const { customer } = await requireCustomer("/account");
  const supabase = createServiceClient();
  let recentOrders: LiveOrder[] = [];
  let recentPreorders: LivePreorder[] = [];
  let b2bAccount: B2bAccount | null = null;
  let dataError = false;

  try {
    const [orders, preorders, b2b] = await Promise.all([
      listCustomerOrders(supabase, customer, 5),
      listCustomerPreorders(supabase, customer, 5),
      supabase
        .from("b2b_accounts")
        .select("id, company_name, approved, approved_at, payment_terms, review_status")
        .eq("customer_id", customer.id)
        .maybeSingle(),
    ]);

    recentOrders = orders as LiveOrder[];
    recentPreorders = preorders as LivePreorder[];
    if (b2b.error) throw new Error(b2b.error.message);
    b2bAccount = (b2b.data as B2bAccount | null) ?? null;
  } catch (error) {
    dataError = true;
    console.error("account dashboard query failed:", safeError(error));
  }

  const preorderExposureCents = recentPreorders
    .filter((preorder) => !["cancelled", "refunded", "converted"].includes(preorder.status))
    .reduce((sum, preorder) => sum + preorder.balance_cents, 0);
  const monthlySpendCents = recentOrders
    .filter((order) => isCurrentMonth(order.placed_at ?? order.created_at))
    .filter((order) => !["cancelled", "refunded"].includes(order.status))
    .reduce((sum, order) => sum + order.total_cents, 0);
  const b2bStatus = b2bAccount
    ? b2bAccount.review_status === "approved" || b2bAccount.approved
      ? "Approved"
      : b2bAccount.review_status === "rejected"
        ? "Rejected"
        : "Pending review"
    : "Not applied";

  return (
    <div className="space-y-8">
      <PageHeader
        action={
          <StatusBadge tone={provisioningTone(customer.provisioning_state)}>
            {formatStatus(customer.provisioning_state)}
          </StatusBadge>
        }
        description="Google-authenticated customers see live billing state, preorder exposure, orders, and wholesale application status in one place."
        eyebrow="Account"
        title="Customer dashboard"
      />

      {dataError ? (
        <div className="rounded-md border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          Account activity could not be loaded right now.
        </div>
      ) : null}
      {params.welcome === "1" ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          Welcome to {appName}. Your Google account is connected, and your dashboard is ready.
        </div>
      ) : null}

      <section className="grid gap-4 md:grid-cols-3">
        <MetricCard
          detail="Remaining balances across active preorders"
          label="Open preorder exposure"
          value={formatMoney(preorderExposureCents)}
        />
        <MetricCard
          detail="Paid and active orders in the current month"
          label="Monthly spend"
          value={formatMoney(monthlySpendCents)}
        />
        <MetricCard
          detail={b2bAccount?.company_name ?? "Wholesale account status"}
          label="B2B status"
          value={b2bStatus}
        />
      </section>

      <section className="grid gap-6 lg:grid-cols-[1fr_24rem]">
        <div className="space-y-6">
          <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold text-zinc-950">
                  {customer.name ?? `${appName} customer`}
                </h2>
                <p className="mt-1 text-sm text-zinc-500">{customer.email}</p>
              </div>
              <StatusBadge tone={customer.billing_state === "active" ? "success" : "warning"}>
                {formatStatus(customer.billing_state)}
              </StatusBadge>
            </div>
            <dl className="mt-6 grid gap-4 sm:grid-cols-3">
              <div>
                <dt className="text-sm text-zinc-500">Payment</dt>
                <dd className="mt-1 font-semibold text-zinc-950">
                  {formatStatus(customer.billing_state)}
                </dd>
              </div>
              <div>
                <dt className="text-sm text-zinc-500">Provisioning</dt>
                <dd className="mt-1 font-semibold text-zinc-950">
                  {formatStatus(customer.provisioning_state)}
                </dd>
              </div>
              <div>
                <dt className="text-sm text-zinc-500">Wholesale</dt>
                <dd className="mt-1 font-semibold text-zinc-950">{b2bStatus}</dd>
              </div>
            </dl>
            {customer.provisioning_error ? (
              <p className="mt-5 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
                Account setup needs operator review.
              </p>
            ) : null}
          </section>

          <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-xl font-semibold text-zinc-950">Recent orders</h2>
              <Link
                className="text-sm font-semibold text-emerald-700 hover:text-emerald-800"
                href="/orders"
              >
                View all
              </Link>
            </div>
            <div className="grid gap-3">
              {recentOrders.length === 0 ? (
                <EmptyState href="/catalog" label="Browse catalog" text="No orders yet." />
              ) : (
                recentOrders.slice(0, 3).map((order) => (
                  <Link
                    className="rounded-md border border-zinc-200 p-4 hover:border-emerald-500"
                    href={`/orders/${order.id}`}
                    key={order.id}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <span className="font-semibold text-zinc-950">{order.id}</span>
                      <StatusBadge tone={orderTone(order.status)}>
                        {formatStatus(order.status)}
                      </StatusBadge>
                    </div>
                    <p className="mt-2 text-sm text-zinc-500">
                      {formatDate(order.placed_at ?? order.created_at)} / {orderItemCount(order)}{" "}
                      item(s)
                    </p>
                    <p className="mt-2 font-semibold text-zinc-950">
                      {formatMoney(order.total_cents, order.currency)}
                    </p>
                  </Link>
                ))
              )}
            </div>
          </section>
        </div>

        <aside className="space-y-5">
          <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-zinc-950">Preorder balances</h2>
            <div className="mt-4 grid gap-3">
              {recentPreorders.length === 0 ? (
                <EmptyState href="/preorders" label="View preorders" text="No active preorders." />
              ) : (
                recentPreorders.slice(0, 3).map((preorder) => (
                  <Link
                    className="rounded-md border border-zinc-200 p-4 hover:border-emerald-500"
                    href="/preorders"
                    key={preorder.id}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-semibold text-zinc-950">{preorder.id}</span>
                      <StatusBadge tone={preorderTone(preorder.status)}>
                        {formatStatus(preorder.status)}
                      </StatusBadge>
                    </div>
                    <p className="mt-2 text-sm text-zinc-500">{productNameForItem(preorder)}</p>
                    <p className="mt-2 font-semibold text-zinc-950">
                      Balance {formatMoney(preorder.balance_cents, preorder.currency)}
                    </p>
                  </Link>
                ))
              )}
            </div>
          </section>
        </aside>
      </section>
    </div>
  );
}

function EmptyState({ href, label, text }: { href: string; label: string; text: string }) {
  return (
    <div className="rounded-md border border-dashed border-zinc-300 p-4 text-sm text-zinc-600">
      <p>{text}</p>
      <Link
        className="mt-3 inline-flex font-semibold text-emerald-700 hover:text-emerald-800"
        href={href}
      >
        {label}
      </Link>
    </div>
  );
}

function isCurrentMonth(value?: string | null): boolean {
  if (!value) return false;
  const date = new Date(value);
  const now = new Date();
  return date.getUTCFullYear() === now.getUTCFullYear() && date.getUTCMonth() === now.getUTCMonth();
}

function orderTone(status: string) {
  if (["paid", "packing", "shipped", "delivered"].includes(status)) return "success" as const;
  if (["cancelled", "refunded"].includes(status)) return "danger" as const;
  return "info" as const;
}

function preorderTone(status: string) {
  if (status === "balance_due") return "warning" as const;
  if (["allocated", "paid", "converted"].includes(status)) return "success" as const;
  if (["cancelled", "refunded"].includes(status)) return "danger" as const;
  return "info" as const;
}

function provisioningTone(status: string) {
  if (status === "active") return "success" as const;
  if (status === "error") return "danger" as const;
  return "info" as const;
}

function safeError(error: unknown): string {
  return error instanceof Error ? error.message : "unknown";
}

type B2bAccount = {
  id: string;
  company_name: string;
  approved: boolean;
  approved_at: string | null;
  payment_terms: string;
  review_status: "pending" | "approved" | "rejected";
};
