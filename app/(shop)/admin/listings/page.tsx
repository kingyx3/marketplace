import Link from "next/link";

import { PageHeader } from "@/app/_components/page-header";
import { StatusBadge } from "@/app/_components/status-badge";
import { upsertListingItem, upsertStorefrontConfiguration } from "@/app/actions/admin";
import { requireStaff } from "@/lib/auth";
import type { SalesChannel } from "@/lib/commerce";
import { createServiceClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

type ListingItemRow = {
  id: string;
  title_override: string | null;
  badge_label: string | null;
  tags: string[] | null;
  channels: SalesChannel[] | null;
  max_per_customer: number | null;
  preorder_reserve: number;
  sort_priority: number;
  featured: boolean;
  published: boolean;
};

type ProductRow = {
  id: string;
  name: string;
  slug: string;
  active: boolean;
  listing_items: ListingItemRow[] | null;
};

type StorefrontConfigurationRow = {
  key: string;
  label: string;
  description: string | null;
  value: Record<string, unknown>;
  active: boolean;
};

const DEFAULT_HEADER_CONFIG = {
  eyebrow: "Catalog",
  title: "Sealed product inventory",
  description:
    "Browse active booster boxes, collector boxes, cases, and preorders with visible stock and allocation limits.",
  emptyTitle: "No active products",
  emptyDescription: "Publish a listing item before opening orders.",
};

export default async function AdminListingsPage() {
  const { staff } = await requireStaff("/admin/listings");
  const supabase = createServiceClient();
  const [products, configurations] = await Promise.all([
    fetchProducts(supabase),
    fetchStorefrontConfigurations(supabase),
  ]);

  const activeListings = products.filter((product) => product.listing_items?.[0]?.published).length;

  return (
    <div className="space-y-8">
      <PageHeader
        action={<StatusBadge tone="success">Staff verified: {staff.role}</StatusBadge>}
        description="Create and maintain storefront listing rows, customer caps, B2B/B2C visibility, tags, sort order, and catalog page configuration directly in Supabase."
        eyebrow="Admin"
        title="Storefront listings"
      />

      <section className="grid gap-4 sm:grid-cols-3">
        <SummaryCard label="Products" value={String(products.length)} />
        <SummaryCard label="Published listings" value={String(activeListings)} />
        <SummaryCard label="Configurations" value={String(configurations.length)} />
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-zinc-950">Listing items</h2>
            <p className="mt-1 text-sm text-zinc-600">
              Product and SKU creation stays in the main admin catalog. These rows control how those
              products appear on the public storefront.
            </p>
          </div>
          <Link className="text-sm font-semibold text-emerald-700 hover:text-emerald-900" href="/admin">
            Back to admin
          </Link>
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          {products.length === 0 ? (
            <p className="rounded-md border border-dashed border-zinc-300 p-4 text-sm text-zinc-600">
              Create a catalog product first, then return here to publish its storefront listing.
            </p>
          ) : (
            products.map((product) => {
              const listing = product.listing_items?.[0] ?? null;
              return (
                <article key={product.id} className="rounded-md border border-zinc-200 p-4">
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="font-semibold text-zinc-950">{product.name}</h3>
                      <p className="mt-1 text-xs text-zinc-500">/{product.slug}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <StatusBadge tone={product.active ? "success" : "warning"}>
                        {product.active ? "product active" : "product archived"}
                      </StatusBadge>
                      <StatusBadge tone={listing?.published ? "success" : "neutral"}>
                        {listing?.published ? "listing live" : "listing hidden"}
                      </StatusBadge>
                    </div>
                  </div>
                  <ListingItemForm listing={listing} product={product} />
                </article>
              );
            })
          )}
        </div>
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="mb-5">
          <h2 className="text-xl font-semibold text-zinc-950">Storefront configurations</h2>
          <p className="mt-1 text-sm text-zinc-600">
            JSON configuration is stored in Supabase and read by the public frontend. Use
            <code className="mx-1 rounded bg-zinc-100 px-1 py-0.5 text-xs">catalog_header</code>
            for the catalog page copy.
          </p>
        </div>

        <div className="grid gap-5 xl:grid-cols-2">
          <form action={upsertStorefrontConfiguration} className="grid gap-3 rounded-md border border-zinc-200 bg-zinc-50 p-4">
            <h3 className="font-semibold text-zinc-950">Create configuration</h3>
            <StorefrontConfigurationFields
              configuration={{
                key: "catalog_header",
                label: "Catalog header copy",
                description: "Eyebrow, title, description, and empty-state copy for the public catalog page.",
                value: DEFAULT_HEADER_CONFIG,
                active: true,
              }}
            />
            <button className="min-h-10 rounded-md bg-zinc-950 px-3 text-xs font-semibold text-white hover:bg-emerald-700">
              Save configuration
            </button>
          </form>

          <div className="grid gap-3">
            {configurations.map((configuration) => (
              <article key={configuration.key} className="rounded-md border border-zinc-200 p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="font-semibold text-zinc-950">{configuration.label}</h3>
                    <p className="mt-1 text-xs text-zinc-500">{configuration.key}</p>
                  </div>
                  <StatusBadge tone={configuration.active ? "success" : "neutral"}>
                    {configuration.active ? "active" : "inactive"}
                  </StatusBadge>
                </div>
                <form action={upsertStorefrontConfiguration} className="grid gap-3">
                  <StorefrontConfigurationFields configuration={configuration} readOnlyKey />
                  <button className="min-h-10 rounded-md border border-zinc-300 px-3 text-xs font-semibold text-zinc-800 hover:border-emerald-600 hover:text-emerald-700">
                    Save configuration
                  </button>
                </form>
              </article>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

function ListingItemForm({
  listing,
  product,
}: {
  listing: ListingItemRow | null;
  product: ProductRow;
}) {
  const channels = listing?.channels ?? ["b2c"];

  return (
    <form action={upsertListingItem} className="grid gap-3">
      <input name="productId" type="hidden" value={product.id} />
      <div className="grid gap-3 md:grid-cols-2">
        <label className="grid gap-1 text-xs font-medium text-zinc-600">
          Title override
          <input
            className="min-h-10 rounded-md border border-zinc-300 px-2 text-sm"
            defaultValue={listing?.title_override ?? ""}
            maxLength={180}
            name="titleOverride"
            placeholder={product.name}
          />
        </label>
        <label className="grid gap-1 text-xs font-medium text-zinc-600">
          Badge label
          <input
            className="min-h-10 rounded-md border border-zinc-300 px-2 text-sm"
            defaultValue={listing?.badge_label ?? ""}
            maxLength={80}
            name="badgeLabel"
            placeholder="Preorder / Featured / B2B"
          />
        </label>
      </div>

      <label className="grid gap-1 text-xs font-medium text-zinc-600">
        Tags (comma or line separated)
        <textarea
          className="min-h-20 rounded-md border border-zinc-300 px-2 py-2 text-sm"
          defaultValue={(listing?.tags ?? []).join(", ")}
          maxLength={800}
          name="tags"
          placeholder="Preorder, Limit 2, Wholesale"
        />
      </label>

      <div className="grid gap-3 md:grid-cols-3">
        <label className="grid gap-1 text-xs font-medium text-zinc-600">
          Max/customer
          <input
            className="min-h-10 rounded-md border border-zinc-300 px-2 text-sm"
            defaultValue={listing?.max_per_customer ?? ""}
            min={1}
            name="maxPerCustomer"
            type="number"
          />
        </label>
        <label className="grid gap-1 text-xs font-medium text-zinc-600">
          B2C preorder reserve
          <input
            className="min-h-10 rounded-md border border-zinc-300 px-2 text-sm"
            defaultValue={listing?.preorder_reserve ?? 0}
            min={0}
            name="preorderReserve"
            type="number"
          />
        </label>
        <label className="grid gap-1 text-xs font-medium text-zinc-600">
          Sort priority
          <input
            className="min-h-10 rounded-md border border-zinc-300 px-2 text-sm"
            defaultValue={listing?.sort_priority ?? 0}
            name="sortPriority"
            type="number"
          />
        </label>
      </div>

      <div className="flex flex-wrap gap-4 text-xs font-medium text-zinc-600">
        <label className="flex items-center gap-2">
          <input defaultChecked={channels.includes("b2c")} name="channels" type="checkbox" value="b2c" />
          Retail/B2C
        </label>
        <label className="flex items-center gap-2">
          <input defaultChecked={channels.includes("b2b")} name="channels" type="checkbox" value="b2b" />
          Wholesale/B2B
        </label>
        <label className="flex items-center gap-2">
          <input type="hidden" name="featured" value="false" />
          <input defaultChecked={listing?.featured ?? false} name="featured" type="checkbox" value="true" />
          Featured
        </label>
        <label className="flex items-center gap-2">
          <input type="hidden" name="published" value="false" />
          <input defaultChecked={listing?.published ?? true} name="published" type="checkbox" value="true" />
          Published
        </label>
      </div>

      <button className="min-h-10 rounded-md border border-zinc-300 px-3 text-xs font-semibold text-zinc-800 hover:border-emerald-600 hover:text-emerald-700">
        Save listing
      </button>
    </form>
  );
}

function StorefrontConfigurationFields({
  configuration,
  readOnlyKey = false,
}: {
  configuration: StorefrontConfigurationRow;
  readOnlyKey?: boolean;
}) {
  return (
    <>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="grid gap-1 text-xs font-medium text-zinc-600">
          Key
          <input
            className="min-h-10 rounded-md border border-zinc-300 px-2 text-sm"
            defaultValue={configuration.key}
            maxLength={120}
            name="key"
            pattern="[a-z0-9]+([_:-][a-z0-9]+)*"
            readOnly={readOnlyKey}
            required
          />
        </label>
        <label className="grid gap-1 text-xs font-medium text-zinc-600">
          Label
          <input
            className="min-h-10 rounded-md border border-zinc-300 px-2 text-sm"
            defaultValue={configuration.label}
            maxLength={160}
            name="label"
            required
          />
        </label>
      </div>
      <label className="grid gap-1 text-xs font-medium text-zinc-600">
        Description
        <input
          className="min-h-10 rounded-md border border-zinc-300 px-2 text-sm"
          defaultValue={configuration.description ?? ""}
          maxLength={500}
          name="description"
        />
      </label>
      <label className="grid gap-1 text-xs font-medium text-zinc-600">
        JSON value
        <textarea
          className="min-h-40 rounded-md border border-zinc-300 px-2 py-2 font-mono text-xs"
          defaultValue={JSON.stringify(configuration.value, null, 2)}
          name="valueJson"
          required
        />
      </label>
      <label className="flex items-center gap-2 text-xs font-medium text-zinc-600">
        <input type="hidden" name="active" value="false" />
        <input defaultChecked={configuration.active} name="active" type="checkbox" value="true" />
        Active
      </label>
    </>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
      <p className="text-sm font-medium text-zinc-500">{label}</p>
      <p className="mt-2 text-3xl font-bold text-zinc-950">{value}</p>
    </div>
  );
}

async function fetchProducts(supabase: ReturnType<typeof createServiceClient>) {
  const { data, error } = await supabase
    .from("products")
    .select(
      "id, name, slug, active, listing_items(id, title_override, badge_label, tags, channels, max_per_customer, preorder_reserve, sort_priority, featured, published)"
    )
    .order("name");

  if (error) {
    throw new Error(`Listing product lookup failed: ${error.message}`);
  }

  return (data ?? []) as unknown as ProductRow[];
}

async function fetchStorefrontConfigurations(supabase: ReturnType<typeof createServiceClient>) {
  const { data, error } = await supabase
    .from("storefront_configurations")
    .select("key, label, description, value, active")
    .order("key");

  if (error) {
    throw new Error(`Storefront configuration lookup failed: ${error.message}`);
  }

  return (data ?? []) as unknown as StorefrontConfigurationRow[];
}
