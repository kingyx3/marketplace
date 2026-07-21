import Link from "next/link";

import {
  ControlData,
  ControlEmptyState,
} from "@/app/(shop)/control/_components/control-resource-ui";
import type { ListingItemRecord } from "@/app/(shop)/control/_components/listing-item-form";
import type { StorefrontConfigurationRecord } from "@/app/(shop)/control/_components/storefront-configuration-form";
import { MetricCard } from "@/app/_components/metric-card";
import { PageHeader } from "@/app/_components/page-header";
import { StatusBadge } from "@/app/_components/status-badge";
import { requireControlPermission } from "@/lib/control-access";
import { createSecretClient } from "@/lib/supabase";
import { toOne, type SupabaseToOne } from "@/lib/supabase-relations";

export const dynamic = "force-dynamic";

type ProductRow = {
  id: string;
  name: string;
  slug: string;
  active: boolean;
  listing_items: SupabaseToOne<ListingItemRecord>;
};

const DEFAULT_HEADER_CONFIG: StorefrontConfigurationRecord = {
  key: "catalog_header",
  label: "Catalog header",
  description: "Catalog heading and empty-state copy.",
  value: {
    eyebrow: "Catalog",
    title: "Sealed products",
    description: "Browse current stock, preorders, and offers.",
    emptyTitle: "No products available",
    emptyDescription: "Check back for the next release.",
  },
  active: true,
};

export default async function ControlListingsPage({
  searchParams,
}: {
  searchParams?: Promise<{ q?: string; status?: string }>;
}) {
  const { staff } = await requireControlPermission(
    "storefront.view",
    "/control/storefront/listings"
  );
  const params = (await searchParams) ?? {};
  const query = params.q?.trim().toLowerCase() ?? "";
  const status = params.status === "live" ? "live" : params.status === "hidden" ? "hidden" : "all";
  const supabase = createSecretClient();
  const [productsResult, configurationResult] = await Promise.all([
    supabase
      .from("products")
      .select(
        "id, name, slug, active, listing_items(id, title_override, badge_label, tags, max_per_customer, preorder_reserve, sort_priority, featured, availability_mode, order_open_at, order_close_at, release_date, published)"
      )
      .order("name"),
    supabase
      .from("storefront_configurations")
      .select("key, label, description, value, active")
      .order("key"),
  ]);

  if (productsResult.error)
    throw new Error(`Listing product lookup failed: ${productsResult.error.message}`);
  if (configurationResult.error) {
    throw new Error(`Storefront configuration lookup failed: ${configurationResult.error.message}`);
  }

  const allProducts = (productsResult.data ?? []) as unknown as ProductRow[];
  const products = allProducts.filter((product) => {
    const listing = toOne(product.listing_items);
    const live = Boolean(listing?.published);
    const matchesStatus = status === "all" || (status === "live" ? live : !live);
    return (
      matchesStatus &&
      (!query || product.name.toLowerCase().includes(query) || product.slug.includes(query))
    );
  });
  const configurations = mergeConfigurations(
    (configurationResult.data ?? []) as StorefrontConfigurationRecord[]
  );
  const activeListings = allProducts.filter(
    (product) => toOne(product.listing_items)?.published
  ).length;

  return (
    <div className="space-y-8">
      <PageHeader
        action={<StatusBadge tone="success">{staff.role}</StatusBadge>}
        description="Review storefront publication and merchandising state, then open a product listing or configuration to edit it."
        eyebrow="Control"
        title="Storefront listings"
      />

      <section className="grid gap-4 sm:grid-cols-3">
        <MetricCard label="Products" value={String(allProducts.length)} detail="Catalog products" />
        <MetricCard
          label="Published"
          value={String(activeListings)}
          detail="Listing publication flag enabled"
        />
        <MetricCard
          label="Configurations"
          value={String(configurations.length)}
          detail="Storefront configuration records"
        />
      </section>

      <form className="grid gap-3 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm sm:grid-cols-[minmax(0,1fr)_12rem_auto]">
        <label className="grid gap-1 text-sm font-medium text-zinc-700">
          Search
          <input
            className="min-h-11 rounded-md border border-zinc-300 px-3 text-base sm:text-sm"
            defaultValue={params.q ?? ""}
            name="q"
            placeholder="Product name or slug"
          />
        </label>
        <label className="grid gap-1 text-sm font-medium text-zinc-700">
          Listing state
          <select
            className="min-h-11 rounded-md border border-zinc-300 px-3 text-base sm:text-sm"
            defaultValue={status}
            name="status"
          >
            <option value="all">All</option>
            <option value="live">Published</option>
            <option value="hidden">Not published</option>
          </select>
        </label>
        <button className="min-h-11 self-end rounded-md bg-zinc-950 px-5 text-sm font-semibold text-white hover:bg-emerald-700">
          Filter
        </button>
      </form>

      {products.length === 0 ? (
        <ControlEmptyState
          description="Create a catalog product or broaden the current listing filters."
          title="No product listings match this view"
        />
      ) : (
        <section className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-zinc-950">Product listings</h2>
            <span className="text-sm text-zinc-500">{products.length} results</span>
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            {products.map((product) => {
              const listing = toOne(product.listing_items);
              return (
                <Link
                  className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm transition hover:border-emerald-500 hover:shadow-md"
                  href={`/control/storefront/listings/${product.id}`}
                  key={product.id}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate font-semibold text-zinc-950">{product.name}</h3>
                      <p className="mt-1 font-mono text-xs text-zinc-500">/{product.slug}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <StatusBadge tone={product.active ? "success" : "warning"}>
                        {product.active ? "Product active" : "Product archived"}
                      </StatusBadge>
                      <StatusBadge tone={listing?.published ? "success" : "neutral"}>
                        {listing?.published ? "Published" : "Not published"}
                      </StatusBadge>
                    </div>
                  </div>
                  <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
                    <ControlData label="Badge" value={listing?.badge_label || "Not set"} />
                    <ControlData label="Featured" value={listing?.featured ? "Yes" : "No"} />
                    <ControlData label="Priority" value={String(listing?.sort_priority ?? 0)} />
                  </dl>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-zinc-950">Storefront configuration</h2>
          <span className="text-sm text-zinc-500">{configurations.length}</span>
        </div>
        <div className="grid gap-4 xl:grid-cols-2">
          {configurations.map((configuration) => (
            <Link
              className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm transition hover:border-emerald-500 hover:shadow-md"
              href={`/control/storefront/listings/configurations/${encodeURIComponent(configuration.key)}`}
              key={configuration.key}
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-zinc-950">{configuration.label}</h3>
                  <p className="mt-1 font-mono text-xs text-zinc-500">{configuration.key}</p>
                </div>
                <StatusBadge tone={configuration.active ? "success" : "neutral"}>
                  {configuration.active ? "Active" : "Inactive"}
                </StatusBadge>
              </div>
              <p className="mt-3 text-sm text-zinc-600">
                {configuration.description ?? "No description"}
              </p>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

function mergeConfigurations(
  configurations: StorefrontConfigurationRecord[]
): StorefrontConfigurationRecord[] {
  if (configurations.some((configuration) => configuration.key === DEFAULT_HEADER_CONFIG.key)) {
    return configurations;
  }
  return [DEFAULT_HEADER_CONFIG, ...configurations];
}
