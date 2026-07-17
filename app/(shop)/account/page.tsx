import Link from "next/link";

import { deleteAccount } from "@/app/actions/account";
import { MetricCard } from "@/app/_components/metric-card";
import { PageHeader } from "@/app/_components/page-header";
import { StatusBadge } from "@/app/_components/status-badge";
import { getAppName } from "@/lib/app-config";
import { requireCustomer } from "@/lib/auth";
import { formatMoney } from "@/lib/money";
import {
  formatDate,
  formatStatus,
  orderItemCount,
  productNameForItem,
  type LiveOrder,
  type LivePreorder,
} from "@/lib/order-display";
import { listCustomerOrders, listCustomerPreorders } from "@/lib/orders";
import { createServiceClient } from "@/lib/supabase";
import { listCustomerWaitlist, type CustomerWaitlistEntry } from "@/lib/waitlist";

export const dynamic = "force-dynamic";

export default async function AccountPage({
  searchParams,
}: {
  searchParams?: Promise<{ welcome?: string; error?: string }>;
}) {
  const params = (await searchParams) ?? {};
  const appName = getAppName();
  const { customer } = await requireCustomer("/account");
  const supabase = createServiceClient();
  let recentOrders: LiveOrder[] = [];
  let recentPreorders: LivePreorder[] = [];
  let recentWaitlist: CustomerWaitlistEntry[] = [];
  let dataError = false;

  try {
    const [orders, preorders, waitlist] = await Promise.all([
      listCustomerOrders(supabase, customer, 5),
      listCustomerPreorders(supabase, customer, 5),
      listCustomerWaitlist(supabase, customer.id, 5),
    ]);

    recentOrders = orders as LiveOrder[];
    recentPreorders = preorders as LivePreorder[];
    recentWaitlist = waitlist;
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
  const activeAlerts = recentWaitlist.filter((entry) => entry.status === "active").length;
  const accountName = customer.name ?? "Your account";

  return (
    <div className="space-y-8">
      <PageHeader
        action={
          <StatusBadge tone={provisioningTone(customer.provisioning_state)}>
            {formatStatus(customer.provisioning_state)}
          </StatusBadge>
        }
        eyebrow="Account"
        title={accountName}
      />

      {dataError ? (
        <Notice tone="danger">Account activity could not be loaded right now.</Notice>
      ) : null}
      {params.welcome === "1" ? (
        <Notice tone="success">Welcome to {appName}. Your account is ready.</Notice>
      ) : null}
      {params.error === "confirm-delete" ? (
        <Notice tone="danger">Confirm account deletion before continuing.</Notice>
      ) : null}
      {params.error === "delete-failed" ? (
        <Notice tone="danger">Account deletion could not be completed.</Notice>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-3">
        <MetricCard detail="Active preorder balances" label="Preorder balance" value={formatMoney(preorderExposureCents)} />
        <MetricCard detail="Orders placed this month" label="Monthly spend" value={formatMoney(monthlySpendCents)} />
        <MetricCard detail="Active product notifications" label="Drop alerts" value={String(activeAlerts)} />
      </section>

      <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <section className="rounded-xl border border-zinc-200 bg-white shadow-sm">
          <div className="flex items-center justify-between gap-4 border-b border-zinc-200 px-5 py-4">
            <h2 className="text-lg font-semibold text-zinc-950">Recent orders</h2>
            <Link className="text-sm font-semibold text-emerald-700 hover:text-emerald-900" href="/orders">
              View all
            </Link>
          </div>
          <div className="grid gap-3 p-4 sm:p-5">
            {recentOrders.length === 0 ? (
              <EmptyState href="/catalog" label="Browse catalog" text="No orders yet." />
            ) : (
              recentOrders.slice(0, 4).map((order) => (
                <Link
                  className="grid gap-3 rounded-lg border border-zinc-200 p-4 transition hover:border-emerald-500 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                  href={`/orders/${order.id}`}
                  key={order.id}
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-semibold text-zinc-950">{order.id}</span>
                      <StatusBadge tone={orderTone(order.status)}>{formatStatus(order.status)}</StatusBadge>
                    </div>
                    <p className="mt-2 text-sm text-zinc-500">
                      {formatDate(order.placed_at ?? order.created_at)} · {orderItemCount(order)} item(s)
                    </p>
                  </div>
                  <p className="font-semibold text-zinc-950 sm:text-right">
                    {formatMoney(order.total_cents, order.currency)}
                  </p>
                </Link>
              ))
            )}
          </div>
        </section>

        <aside className="space-y-5">
          <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-zinc-500">Profile</p>
                <p className="mt-1 truncate font-semibold text-zinc-950">{customer.email}</p>
              </div>
              <StatusBadge tone={provisioningTone(customer.provisioning_state)}>
                {formatStatus(customer.provisioning_state)}
              </StatusBadge>
            </div>
            {customer.provisioning_error ? (
              <p className="mt-4 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
                Account setup needs support review.
              </p>
            ) : null}
          </section>

          <ActivityCard title="Preorders" href="/preorders" linkLabel="View all">
            {recentPreorders.length === 0 ? (
              <p className="text-sm text-zinc-500">No active preorders.</p>
            ) : (
              recentPreorders.slice(0, 3).map((preorder) => (
                <Link
                  className="block rounded-md border border-zinc-200 p-3 hover:border-emerald-500"
                  href="/preorders"
                  key={preorder.id}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="truncate text-sm font-semibold text-zinc-950">
                      {productNameForItem(preorder)}
                    </span>
                    <StatusBadge tone={preorderTone(preorder.status)}>
                      {formatStatus(preorder.status)}
                    </StatusBadge>
                  </div>
                  <p className="mt-2 text-sm text-zinc-500">
                    Balance {formatMoney(preorder.balance_cents, preorder.currency)}
                  </p>
                </Link>
              ))
            )}
          </ActivityCard>

          <ActivityCard title="Drop alerts" href="/catalog" linkLabel="Browse">
            {recentWaitlist.length === 0 ? (
              <p className="text-sm text-zinc-500">No drop alerts.</p>
            ) : (
              recentWaitlist.slice(0, 3).map((entry) => (
                <Link
                  className="block rounded-md border border-zinc-200 p-3 hover:border-emerald-500"
                  href={entry.productSlug ? `/catalog/${entry.productSlug}` : "/catalog"}
                  key={entry.id}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="truncate text-sm font-semibold text-zinc-950">{entry.productName}</span>
                    <StatusBadge tone={waitlistTone(entry.status)}>{formatStatus(entry.status)}</StatusBadge>
                  </div>
                </Link>
              ))
            )}
          </ActivityCard>
        </aside>
      </section>

      <section className="border-t border-zinc-200 pt-8">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-zinc-950">Account access</h2>
            <p className="mt-1 text-sm text-zinc-500">Manage this account and session.</p>
          </div>
          <div className="grid w-full gap-3 sm:w-auto sm:min-w-64">
            <form action="/auth/sign-out" method="post">
              <button className="inline-flex min-h-11 w-full items-center justify-center rounded-md border border-zinc-300 px-4 text-sm font-semibold text-zinc-800 hover:border-zinc-500 hover:bg-white">
                Sign out
              </button>
            </form>
            <details className="rounded-md border border-rose-200 bg-white p-4">
              <summary className="cursor-pointer text-sm font-semibold text-rose-700">Delete account</summary>
              <form action={deleteAccount} className="mt-4 grid gap-3">
                <label className="flex items-start gap-2 text-sm text-zinc-600">
                  <input
                    className="mt-0.5 size-4"
                    name="confirmDeletion"
                    required
                    type="checkbox"
                    value="yes"
                  />
                  Confirm account deletion
                </label>
                <button className="inline-flex min-h-11 items-center justify-center rounded-md bg-rose-700 px-4 text-sm font-semibold text-white hover:bg-rose-800">
                  Delete account
                </button>
              </form>
            </details>
          </div>
        </div>
      </section>
    </div>
  );
}

function ActivityCard({
  title,
  href,
  linkLabel,
  children,
}: {
  title: string;
  href: string;
  linkLabel: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-zinc-950">{title}</h2>
        <Link className="text-sm font-semibold text-emerald-700 hover:text-emerald-900" href={href}>
          {linkLabel}
        </Link>
      </div>
      <div className="grid gap-3">{children}</div>
    </section>
  );
}

function EmptyState({ href, label, text }: { href: string; label: string; text: string }) {
  return (
    <div className="rounded-lg border border-dashed border-zinc-300 p-5 text-sm text-zinc-600">
      <p>{text}</p>
      <Link className="mt-3 inline-flex font-semibold text-emerald-700 hover:text-emerald-900" href={href}>
        {label}
      </Link>
    </div>
  );
}

function Notice({ children, tone }: { children: React.ReactNode; tone: "success" | "danger" }) {
  const className =
    tone === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-900"
      : "border-rose-200 bg-rose-50 text-rose-800";
  return <div className={`rounded-md border p-4 text-sm ${className}`}>{children}</div>;
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

function waitlistTone(status: string) {
  if (status === "notified") return "success" as const;
  if (status === "cancelled") return "danger" as const;
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
