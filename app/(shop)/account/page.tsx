import Link from "next/link";

import { DeleteAccountDialog } from "@/app/(shop)/account/delete-account-dialog";
import { MetricCard } from "@/app/_components/metric-card";
import { PageHeader } from "@/app/_components/page-header";
import { StatusBadge } from "@/app/_components/status-badge";
import { updateAccountSettings } from "@/app/actions/account";
import { getAppName } from "@/lib/app-config";
import { requireCustomer } from "@/lib/auth";
import { formatMoney } from "@/lib/money";
import {
  formatDate,
  formatStatus,
  orderItemCount,
  preorderStatusLabel,
  productNameForItem,
  type LiveOrder,
  type LivePreorder,
} from "@/lib/order-display";
import { listCustomerOrders, listCustomerPreorders } from "@/lib/orders";
import { createSecretClient } from "@/lib/supabase";
import { listCustomerWaitlist, type CustomerWaitlistEntry } from "@/lib/waitlist";

export const dynamic = "force-dynamic";

export default async function AccountPage({
  searchParams,
}: {
  searchParams?: Promise<{
    welcome?: string;
    error?: string;
    settings?: string;
  }>;
}) {
  const params = (await searchParams) ?? {};
  const appName = getAppName();
  const { customer } = await requireCustomer("/account");
  const supabase = createSecretClient();
  let recentOrders: LiveOrder[] = [];
  let recentPreorders: LivePreorder[] = [];
  let recentWaitlist: CustomerWaitlistEntry[] = [];
  let dataError = false;

  try {
    const [orders, preorders, waitlist] = await Promise.all([
      listCustomerOrders(supabase, customer, 8),
      listCustomerPreorders(supabase, customer, 8),
      listCustomerWaitlist(supabase, customer.id, 8),
    ]);

    recentOrders = orders as LiveOrder[];
    recentPreorders = preorders as LivePreorder[];
    recentWaitlist = waitlist;
  } catch (error) {
    dataError = true;
    console.error("account dashboard query failed:", safeError(error));
  }

  const activePreorders = recentPreorders.filter(
    (preorder) => !["cancelled", "refunded", "converted"].includes(preorder.status)
  ).length;
  const activeAlerts = recentWaitlist.filter((entry) => entry.status === "active").length;
  const deliveryAddresses = recentDeliveryAddresses(recentOrders);
  const accountName = customer.name?.trim() || "Your account";

  return (
    <div className="space-y-8">
      <PageHeader
        action={
          <Link
            className="inline-flex min-h-11 items-center justify-center rounded-md bg-zinc-950 px-5 text-sm font-semibold text-white hover:bg-emerald-700"
            href="/orders"
          >
            View all orders
          </Link>
        }
        description="Review purchases, delivery details, restock alerts, and account settings."
        eyebrow="Account"
        title={accountName}
      />

      {dataError ? (
        <Notice tone="danger">Some account activity could not be loaded right now.</Notice>
      ) : null}
      {params.welcome === "1" ? (
        <Notice tone="success">Welcome to {appName}. Your account is ready.</Notice>
      ) : null}
      {params.error === "delete-failed" ? (
        <Notice tone="danger">Account deletion could not be completed.</Notice>
      ) : null}
      {params.settings === "updated" ? (
        <Notice tone="success">Account settings updated.</Notice>
      ) : null}
      {params.settings === "invalid" ? (
        <Notice tone="danger">Your display name must be 100 characters or fewer.</Notice>
      ) : null}
      {params.settings === "failed" ? (
        <Notice tone="danger">Account settings could not be updated.</Notice>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-3">
        <MetricCard
          detail="Shown in your purchase history"
          label="Recent orders"
          value={String(recentOrders.length)}
        />
        <MetricCard
          detail="Awaiting allocation or fulfilment"
          label="Active pre-orders"
          value={String(activePreorders)}
        />
        <MetricCard
          detail="Products you want to hear about"
          label="Restock alerts"
          value={String(activeAlerts)}
        />
      </section>

      <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <section className="rounded-xl border border-zinc-200 bg-white shadow-sm">
          <div className="flex items-center justify-between gap-4 border-b border-zinc-200 px-5 py-4">
            <div>
              <h2 className="text-lg font-semibold text-zinc-950">Order history</h2>
              <p className="mt-1 text-sm text-zinc-500">Your latest completed checkouts.</p>
            </div>
            <Link
              className="shrink-0 text-sm font-semibold text-emerald-700 hover:text-emerald-900"
              href="/orders#orders"
            >
              View all
            </Link>
          </div>
          <div className="grid gap-3 p-4 sm:p-5">
            {recentOrders.length === 0 ? (
              <EmptyState href="/products" label="Browse products" text="No orders yet." />
            ) : (
              recentOrders.slice(0, 4).map((order) => (
                <Link
                  className="grid gap-3 rounded-lg border border-zinc-200 p-4 transition hover:border-emerald-500 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                  href={`/orders/${order.id}`}
                  key={order.id}
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-semibold text-zinc-950">
                        Order {orderReference(order.id)}
                      </span>
                      <StatusBadge tone={orderTone(order.status)}>
                        {formatStatus(order.status)}
                      </StatusBadge>
                    </div>
                    <p className="mt-2 text-sm text-zinc-500">
                      {formatDate(order.placed_at ?? order.created_at)} · {orderItemCount(order)}{" "}
                      item(s)
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

        <ActivityCard title="Pre-orders" href="/orders#preorders" linkLabel="View all">
          {recentPreorders.length === 0 ? (
            <p className="text-sm text-zinc-500">No pre-orders yet.</p>
          ) : (
            recentPreorders.slice(0, 4).map((preorder) => (
              <Link
                className="block rounded-md border border-zinc-200 p-3 hover:border-emerald-500"
                href="/orders#preorders"
                key={preorder.id}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="min-w-0 truncate text-sm font-semibold text-zinc-950">
                    {productNameForItem(preorder)}
                  </span>
                  <StatusBadge tone={preorderTone(preorder.status)}>
                    {preorderStatusLabel(preorder.status)}
                  </StatusBadge>
                </div>
                <p className="mt-2 text-sm text-zinc-500">
                  {formatMoney(preorder.deposit_cents, preorder.currency)} paid
                </p>
              </Link>
            ))
          )}
        </ActivityCard>
      </section>

      <section className="grid scroll-mt-28 gap-6 lg:grid-cols-2" id="settings">
        <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6">
          <div>
            <h2 className="text-lg font-semibold text-zinc-950">Delivery addresses</h2>
            <p className="mt-1 text-sm leading-6 text-zinc-500">
              Recent destinations from your orders. Enter a new address during checkout.
            </p>
          </div>
          <div className="mt-5 grid gap-3">
            {deliveryAddresses.length === 0 ? (
              <div className="rounded-lg border border-dashed border-zinc-300 p-4 text-sm text-zinc-600">
                No delivery address has been used yet.
              </div>
            ) : (
              deliveryAddresses.map((address) => (
                <address
                  className="rounded-lg border border-zinc-200 p-4 text-sm not-italic leading-6 text-zinc-700"
                  key={address.key}
                >
                  <p className="font-semibold text-zinc-950">{address.recipientName}</p>
                  <p>{address.line1}</p>
                  {address.line2 ? <p>{address.line2}</p> : null}
                  <p>{address.locality}</p>
                </address>
              ))
            )}
          </div>
        </section>

        <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6">
          <h2 className="text-lg font-semibold text-zinc-950">Account settings</h2>
          <p className="mt-1 text-sm text-zinc-500">Update how we identify and contact you.</p>
          <form action={updateAccountSettings} className="mt-5 grid gap-4">
            <label className="grid gap-2 text-sm font-medium text-zinc-700">
              Display name
              <input
                className="min-h-11 rounded-md border border-zinc-300 px-3 text-sm"
                defaultValue={customer.name ?? ""}
                maxLength={100}
                name="name"
                placeholder="Your name"
              />
            </label>
            <label className="grid gap-2 text-sm font-medium text-zinc-700">
              Email
              <input
                className="min-h-11 rounded-md border border-zinc-200 bg-zinc-100 px-3 text-sm text-zinc-600"
                disabled
                value={customer.email}
              />
            </label>
            <label className="flex items-start gap-3 rounded-md border border-zinc-200 p-3 text-sm text-zinc-700">
              <input
                className="mt-0.5 size-4"
                defaultChecked={Boolean(customer.marketing_opt_in)}
                name="marketingOptIn"
                type="checkbox"
                value="yes"
              />
              <span>
                <span className="font-semibold text-zinc-950">Product news and offers</span>
                <span className="mt-1 block text-xs leading-5 text-zinc-500">
                  Receive occasional marketing updates. Transactional order messages are unaffected.
                </span>
              </span>
            </label>
            <button className="min-h-11 rounded-md bg-zinc-950 px-4 text-sm font-semibold text-white hover:bg-emerald-700">
              Save settings
            </button>
          </form>
          <div className="mt-5 border-t border-zinc-200 pt-5">
            <form action="/auth/sign-out" method="post">
              <button className="inline-flex min-h-11 w-full items-center justify-center rounded-md border border-zinc-300 px-4 text-sm font-semibold text-zinc-800 hover:border-zinc-500 hover:bg-zinc-50">
                Sign out
              </button>
            </form>
          </div>
        </section>
      </section>

      <ActivityCard title="Restock alerts" href="/products" linkLabel="Browse products">
        {recentWaitlist.length === 0 ? (
          <p className="text-sm text-zinc-500">No restock alerts.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {recentWaitlist.slice(0, 6).map((entry) => (
              <Link
                className="block rounded-md border border-zinc-200 p-3 hover:border-emerald-500"
                href={entry.productSlug ? `/products/${entry.productSlug}` : "/products"}
                key={entry.id}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="truncate text-sm font-semibold text-zinc-950">
                    {entry.productName}
                  </span>
                  <StatusBadge tone={waitlistTone(entry.status)}>
                    {formatStatus(entry.status)}
                  </StatusBadge>
                </div>
                <p className="mt-2 text-xs capitalize text-zinc-500">{entry.channel}</p>
              </Link>
            ))}
          </div>
        )}
      </ActivityCard>

      <section className="rounded-xl border border-rose-200 bg-rose-50 p-5 text-center sm:p-6">
        <h2 className="text-lg font-semibold text-rose-950">Delete account</h2>
        <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-rose-800">
          Deleting your account disables access and signs you out. Review the confirmation
          carefully.
        </p>
        <div className="mt-5">
          <DeleteAccountDialog />
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
    <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6">
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
      <Link
        className="mt-3 inline-flex font-semibold text-emerald-700 hover:text-emerald-900"
        href={href}
      >
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

function recentDeliveryAddresses(orders: LiveOrder[]): DeliveryAddress[] {
  const addresses = new Map<string, DeliveryAddress>();

  for (const order of orders) {
    const address = parseDeliveryAddress(order.shipping_address);
    if (address && !addresses.has(address.key)) addresses.set(address.key, address);
    if (addresses.size === 3) break;
  }

  return [...addresses.values()];
}

function parseDeliveryAddress(value: unknown): DeliveryAddress | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const recipientName = textValue(row.recipientName);
  const line1 = textValue(row.line1);
  const line2 = textValue(row.line2);
  const postalCode = textValue(row.postalCode);
  const countryCode = textValue(row.countryCode).toUpperCase();
  if (!recipientName || !line1 || !postalCode) return null;

  const country = countryCode === "SG" ? "Singapore" : countryCode;
  const locality = [country, postalCode].filter(Boolean).join(" ");
  const key = [recipientName, line1, line2, locality].join("|").toLowerCase();
  return { key, recipientName, line1, line2, locality };
}

function textValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function orderReference(id: string): string {
  return `#${id.slice(0, 8).toUpperCase()}`;
}

function orderTone(status: string) {
  if (["paid", "packing", "shipped", "delivered"].includes(status)) return "success" as const;
  if (["cancelled", "refunded"].includes(status)) return "danger" as const;
  return "info" as const;
}

function preorderTone(status: string) {
  if (status === "refund_pending") return "warning" as const;
  if (["allocated", "paid", "converted"].includes(status)) return "success" as const;
  if (["cancelled", "refunded"].includes(status)) return "danger" as const;
  return "info" as const;
}

function waitlistTone(status: string) {
  if (status === "notified") return "success" as const;
  if (status === "cancelled") return "danger" as const;
  return "info" as const;
}

function safeError(error: unknown): string {
  return error instanceof Error ? error.message : "unknown";
}

interface DeliveryAddress {
  key: string;
  recipientName: string;
  line1: string;
  line2: string;
  locality: string;
}
