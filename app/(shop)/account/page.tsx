import Link from "next/link";
import { MetricCard } from "@/app/_components/metric-card";
import { PageHeader } from "@/app/_components/page-header";
import { StatusBadge } from "@/app/_components/status-badge";
import {
  accessStates,
  formatMoney,
  getPreorderExposure,
  orders,
  preorders,
} from "@/app/_data/marketplace-fixtures";
import { requireCustomer } from "@/lib/auth";

const toneByAccessState = {
  neutral: "neutral",
  warning: "warning",
  info: "info",
  success: "success",
  danger: "danger",
} as const;

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const { customer } = await requireCustomer("/account");

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Account"
        title="Customer dashboard"
        description="Google-authenticated customers see billing state, preorder exposure, orders, and wholesale application status in one place."
        action={<StatusBadge tone="success">{customer.provisioning_state}</StatusBadge>}
      />

      <section className="grid gap-4 md:grid-cols-3">
        <MetricCard
          label="Open preorder exposure"
          value={formatMoney(getPreorderExposure())}
          detail="Remaining balances across allocated and pending preorders"
        />
        <MetricCard
          label="Monthly spend"
          value={formatMoney(0)}
          detail="Retail and preorder deposits this month"
        />
        <MetricCard
          label="B2B status"
          value={customer.billing_state}
          detail="Billing state is verified server-side before paid operations"
        />
      </section>

      <section className="grid gap-6 lg:grid-cols-[1fr_24rem]">
        <div className="space-y-6">
          <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold text-zinc-950">
                  {customer.name ?? "Marketplace customer"}
                </h2>
                <p className="mt-1 text-sm text-zinc-500">{customer.email}</p>
              </div>
              <StatusBadge tone={customer.billing_state === "active" ? "success" : "warning"}>
                {customer.billing_state}
              </StatusBadge>
            </div>
            <dl className="mt-6 grid gap-4 sm:grid-cols-3">
              <div>
                <dt className="text-sm text-zinc-500">Segment</dt>
                <dd className="mt-1 font-semibold text-zinc-950">Customer</dd>
              </div>
              <div>
                <dt className="text-sm text-zinc-500">Currency</dt>
                <dd className="mt-1 font-semibold text-zinc-950">SGD</dd>
              </div>
              <div>
                <dt className="text-sm text-zinc-500">Notifications</dt>
                <dd className="mt-1 font-semibold text-zinc-950">Email primary</dd>
              </div>
            </dl>
          </section>

          <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-xl font-semibold text-zinc-950">Account states</h2>
              <StatusBadge tone="info">Google only</StatusBadge>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {accessStates.map((state) => (
                <article key={state.key} className="rounded-md border border-zinc-200 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h3 className="font-semibold text-zinc-950">{state.label}</h3>
                    <StatusBadge tone={toneByAccessState[state.tone]}>{state.action}</StatusBadge>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-zinc-600">{state.detail}</p>
                </article>
              ))}
            </div>
          </section>
        </div>

        <aside className="space-y-5">
          <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-zinc-950">Recent orders</h2>
            <div className="mt-4 grid gap-3">
              {orders.map((order) => (
                <Link
                  href={`/orders/${order.id}`}
                  key={order.id}
                  className="rounded-md border border-zinc-200 p-4 hover:border-emerald-500"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-semibold text-zinc-950">{order.id}</span>
                    <StatusBadge tone="success">{order.status}</StatusBadge>
                  </div>
                  <p className="mt-2 text-sm text-zinc-500">{formatMoney(order.totalCents)}</p>
                </Link>
              ))}
            </div>
          </section>

          <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-zinc-950">Preorder balances</h2>
            <div className="mt-4 grid gap-3">
              {preorders.map((preorder) => (
                <Link
                  href="/preorders"
                  key={preorder.id}
                  className="rounded-md border border-zinc-200 p-4 hover:border-emerald-500"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-semibold text-zinc-950">{preorder.id}</span>
                    <StatusBadge tone={preorder.status === "balance_due" ? "warning" : "info"}>
                      {preorder.status.replaceAll("_", " ")}
                    </StatusBadge>
                  </div>
                  <p className="mt-2 text-sm text-zinc-500">
                    Balance {formatMoney(preorder.balanceCents, preorder.currency)}
                  </p>
                </Link>
              ))}
            </div>
          </section>
        </aside>
      </section>
    </div>
  );
}
