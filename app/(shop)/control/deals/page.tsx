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
import { requireControlPermission } from "@/lib/control-access";
import { createServiceClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function ControlDealsPage({
  searchParams,
}: {
  searchParams?: Promise<{ q?: string; status?: string }>;
}) {
  const { staff } = await requireControlPermission("manage_catalog", "/control/deals");
  const params = (await searchParams) ?? {};
  const query = params.q?.trim().toLowerCase() ?? "";
  const status =
    params.status === "active" ? "active" : params.status === "inactive" ? "inactive" : "all";
  const { data, error } = await createServiceClient()
    .from("limited_time_deals")
    .select(
      "id, code, sku_id, title, description, discount_bps, visibility, starts_at, ends_at, sort_priority, active"
    )
    .order("starts_at", { ascending: false });

  if (error) throw new Error(`Limited-time deal lookup failed: ${error.message}`);

  const allDeals = (data ?? []) as DealRecord[];
  const deals = allDeals.filter((deal) => {
    const matchesStatus =
      status === "all" || (status === "active" ? deal.active : !deal.active);
    return matchesStatus && (!query || deal.title.toLowerCase().includes(query) || deal.code.includes(query));
  });
  const now = Date.now();
  const liveCount = allDeals.filter(
    (deal) => deal.active && Date.parse(deal.starts_at) <= now && Date.parse(deal.ends_at) > now
  ).length;

  return (
    <div className="space-y-8">
      <PageHeader
        action={
          <>
            <StatusBadge tone="success">{staff.role}</StatusBadge>
            <ControlPrimaryLink href="/control/deals/new">Add deal</ControlPrimaryLink>
          </>
        }
        description="Review scheduled promotions and open a deal to change its SKU, discount, audience, window, or lifecycle."
        eyebrow="Control"
        title="Limited-time deals"
      />

      <section className="grid gap-4 sm:grid-cols-3">
        <MetricCard label="Deals" value={String(allDeals.length)} detail="Configured promotions" />
        <MetricCard label="Live now" value={String(liveCount)} detail="Active and inside the scheduled window" />
        <MetricCard label="Matching" value={String(deals.length)} detail="Current search and status filter" />
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
          action={<ControlPrimaryLink href="/control/deals/new">Add deal</ControlPrimaryLink>}
          description="Create the first promotion or broaden the current filters."
          title="No deals match this view"
        />
      ) : (
        <section className="grid gap-4 xl:grid-cols-2">
          {deals.map((deal) => (
            <Link
              className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm transition hover:border-emerald-500 hover:shadow-md"
              href={`/control/deals/${deal.id}`}
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
              <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
                <ControlData label="Discount" value={`${(deal.discount_bps / 100).toFixed(2)}%`} />
                <ControlData label="Starts" value={formatDate(deal.starts_at)} />
                <ControlData label="Ends" value={formatDate(deal.ends_at)} />
              </dl>
            </Link>
          ))}
        </section>
      )}
    </div>
  );
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-SG", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Singapore",
  }).format(new Date(value));
}
