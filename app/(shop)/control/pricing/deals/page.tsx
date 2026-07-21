import Link from "next/link";

import {
  ControlData,
  ControlEmptyState,
  ControlPrimaryLink,
} from "@/app/(shop)/control/_components/control-resource-ui";
import type { DealRecord } from "@/app/(shop)/control/_components/deal-form";
import { MetricCard } from "@/app/_components/metric-card";
import { PageHeader } from "@/app/_components/page-header";
import { StatusBadge } from "@/app/_components/status-badge";
import { hasControlPermission, requireControlPermission } from "@/lib/control-access";
import { formatMoney } from "@/lib/money";
import { createSecretClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

type DealListRecord = DealRecord & {
  booster_box_skus:
    | { price_cents: number; currency: string }
    | Array<{ price_cents: number; currency: string }>
    | null;
};

export default async function ControlDealsPage({
  searchParams,
}: {
  searchParams?: Promise<{ q?: string; status?: string }>;
}) {
  const { staff } = await requireControlPermission("pricing.view", "/control/pricing/deals");
  const canManage = hasControlPermission(staff, "pricing.manage");
  const params = (await searchParams) ?? {};
  const query = params.q?.trim().toLowerCase() ?? "";
  const status =
    params.status === "active" ? "active" : params.status === "inactive" ? "inactive" : "all";
  const { data, error } = await createSecretClient()
    .from("limited_time_deals")
    .select(
      "id, code, sku_id, title, description, discount_bps, deal_price_cents, visibility, starts_at, ends_at, sort_priority, active, booster_box_skus(price_cents, currency)"
    )
    .order("starts_at", { ascending: false });

  if (error) throw new Error(`Limited-time deal lookup failed: ${error.message}`);

  const allDeals = (data ?? []) as unknown as DealListRecord[];
  const deals = allDeals.filter((deal) => {
    const matchesStatus = status === "all" || (status === "active" ? deal.active : !deal.active);
    return (
      matchesStatus &&
      (!query || deal.title.toLowerCase().includes(query) || deal.code.includes(query))
    );
  });
  const enabledCount = allDeals.filter((deal) => deal.active).length;

  return (
    <div className="space-y-8">
      <PageHeader
        action={
          <>
            <StatusBadge tone="success">{staff.role}</StatusBadge>
            {canManage ? (
              <ControlPrimaryLink href="/control/pricing/deals/new">Create deal</ControlPrimaryLink>
            ) : null}
          </>
        }
        description="Review scheduled promotions and open a deal to change its SKU, exact deal price, audience, window, or lifecycle."
        eyebrow="Control"
        title="Limited-time deals"
      />

      <section className="grid gap-4 sm:grid-cols-3">
        <MetricCard label="Deals" value={String(allDeals.length)} detail="Configured promotions" />
        <MetricCard
          label="Enabled"
          value={String(enabledCount)}
          detail="Schedules eligible to become live"
        />
        <MetricCard
          label="Matching"
          value={String(deals.length)}
          detail="Current search and status filter"
        />
      </section>

      <form className="grid gap-3 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm sm:grid-cols-[minmax(0,1fr)_12rem_auto]">
        <label className="grid gap-1 text-sm font-medium text-zinc-700">
          Search
          <input
            className="min-h-11 rounded-md border border-zinc-300 px-3 text-base sm:text-sm"
            defaultValue={params.q ?? ""}
            name="q"
            placeholder="Title or code"
          />
        </label>
        <label className="grid gap-1 text-sm font-medium text-zinc-700">
          Status
          <select
            className="min-h-11 rounded-md border border-zinc-300 px-3 text-base sm:text-sm"
            defaultValue={status}
            name="status"
          >
            <option value="all">All</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </label>
        <button className="min-h-11 self-end rounded-md bg-zinc-950 px-5 text-sm font-semibold text-white hover:bg-emerald-700">
          Filter
        </button>
      </form>

      {deals.length === 0 ? (
        <ControlEmptyState
          action={
            canManage ? (
              <ControlPrimaryLink href="/control/pricing/deals/new">Create deal</ControlPrimaryLink>
            ) : undefined
          }
          description="Create the first promotion or broaden the current filters."
          title="No deals match this view"
        />
      ) : (
        <section className="grid gap-4 xl:grid-cols-2">
          {deals.map((deal) => {
            const skuPrice = one(deal.booster_box_skus);
            const currency = skuPrice?.currency ?? "SGD";
            return (
              <Link
                className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm transition hover:border-emerald-500 hover:shadow-md"
                href={`/control/pricing/deals/${deal.id}`}
                key={deal.id}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="truncate font-semibold text-zinc-950">{deal.title}</h2>
                    <p className="mt-1 font-mono text-xs text-zinc-500">{deal.code}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <StatusBadge tone={deal.visibility === "public" ? "success" : "neutral"}>
                      {deal.visibility}
                    </StatusBadge>
                    <StatusBadge tone={deal.active ? "success" : "warning"}>
                      {deal.active ? "Active" : "Inactive"}
                    </StatusBadge>
                  </div>
                </div>
                <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-4">
                  <ControlData
                    label="Original"
                    value={skuPrice ? formatMoney(skuPrice.price_cents, currency) : "Unavailable"}
                  />
                  <ControlData label="Deal price" value={formatMoney(deal.deal_price_cents, currency)} />
                  <ControlData label="Starts" value={formatDate(deal.starts_at)} />
                  <ControlData label="Ends" value={formatDate(deal.ends_at)} />
                </dl>
              </Link>
            );
          })}
        </section>
      )}
    </div>
  );
}

function one<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-SG", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Singapore",
  }).format(new Date(value));
}
