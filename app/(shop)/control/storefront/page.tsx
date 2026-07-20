import Link from "next/link";

import { MetricCard } from "@/app/_components/metric-card";
import { PageHeader } from "@/app/_components/page-header";
import { StatusBadge } from "@/app/_components/status-badge";
import { hasControlPermission, requireControlPermission } from "@/lib/control-access";
import { createServiceClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function ControlStorefrontPage() {
  const { staff } = await requireControlPermission("storefront.view", "/control/storefront");
  const supabase = createServiceClient();
  const [listingsResult, configurationsResult] = await Promise.all([
    supabase.from("listing_items").select("id, availability_mode, published"),
    supabase
      .from("storefront_configurations")
      .select("id", { count: "exact", head: true })
      .eq("active", true),
  ]);
  if (listingsResult.error)
    throw new Error(`Listing lookup failed: ${listingsResult.error.message}`);
  if (configurationsResult.error) {
    throw new Error(
      `Storefront configuration lookup failed: ${configurationsResult.error.message}`
    );
  }

  const listings = listingsResult.data ?? [];
  const published = listings.filter((listing) => listing.published).length;
  const ready = listings.filter(
    (listing) => listing.availability_mode !== "unavailable" && !listing.published
  ).length;

  return (
    <div className="space-y-8">
      <PageHeader
        description="Own customer-facing content, availability, merchandising, and publication after Catalog and Pricing are ready."
        eyebrow="Control"
        title="Storefront"
      />

      <section className="grid gap-4 sm:grid-cols-3">
        <MetricCard label="Published" value={String(published)} detail="Customer-facing listings" />
        <MetricCard
          label="Awaiting review"
          value={String(ready)}
          detail="Availability set but not published"
        />
        <MetricCard
          label="Configurations"
          value={String(configurationsResult.count ?? 0)}
          detail="Active storefront settings"
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <WorkspaceCard
          detail="Set availability, ordering windows, release dates, merchandising content, and final publication."
          href="/control/storefront/listings"
          label="Listings and availability"
          status={hasControlPermission(staff, "storefront.manage") ? "Manage" : "Review"}
        />
        <WorkspaceCard
          detail="Review storefront copy and presentation settings without changing product identity or price."
          href="/control/storefront/listings"
          label="Storefront configuration"
          status={hasControlPermission(staff, "storefront.manage") ? "Manage" : "Review"}
        />
      </section>
    </div>
  );
}

function WorkspaceCard({
  detail,
  href,
  label,
  status,
}: {
  detail: string;
  href: string;
  label: string;
  status: string;
}) {
  return (
    <Link
      className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm transition hover:border-emerald-500 hover:shadow-md"
      href={href}
    >
      <div className="flex items-start justify-between gap-3">
        <h2 className="font-semibold text-zinc-950">{label}</h2>
        <StatusBadge tone="info">{status}</StatusBadge>
      </div>
      <p className="mt-2 text-sm leading-6 text-zinc-600">{detail}</p>
    </Link>
  );
}
