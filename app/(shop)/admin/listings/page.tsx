import Link from "next/link";

import { PageHeader } from "@/app/_components/page-header";
import { StatusBadge } from "@/app/_components/status-badge";
import { upsertListingItem, upsertStorefrontConfiguration } from "@/app/actions/admin";
import { requireStaff } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

type ListingItemRow = {
  id: string;
  title_override: string | null;
  badge_label: string | null;
  tags: string[] | null;
  channels: string[] | null;
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
  title: "Sealed products",
  description: "Browse current stock, preorders, and offers.",
  emptyTitle: "No products available",
  emptyDescription: "Check back for the next release.",
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
        action={<StatusBadge tone="success">{staff.role}</StatusBadge>}
        description="Control storefront visibility, badges, limits, and ordering."
        eyebrow="Admin"
        title="Storefront listings"
      />

      <section className="grid gap-4 sm:grid-cols-3">
        <SummaryCard label="Products" value={String(products.length)} />
        <SummaryCard label="Published" value={String(activeListings)} />
        <SummaryCard label="Configurations" value={String(configurations.length)} />
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-semibold text-zinc-950">Listings</h2>
          <Link className="text-sm font-semibold text-emerald-700 hover:text-emerald-900" href="/admin">
            Back to admin
          </Link>
        </div>
        <div className="grid gap-4 xl:grid-cols-2">
          {products.length === 0 ? (
            <p className="rounded-md border border-dashed border-zinc-300 p-4 text-sm text-zinc-600">
              Create a catalog product first.
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
                    <div className="flex gap-2">
                      <StatusBadge tone={product.active ? "success" : "warning"}>
                        {product.active ? "Product active" : "Product archived"}
                      </StatusBadge>
                      <StatusBadge tone={listing?.published ? "success" : "neutral"}>
                        {listing?.published ? "Live" : "Hidden"}
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
        <h2 className="text-xl font-semibold text-zinc-950">Storefront configuration</h2>
        <div className="mt-5 grid gap-5 xl:grid-cols-2">
          <form
            action={upsertStorefrontConfiguration}
            className="grid gap-3 rounded-md border border-zinc-200 bg-zinc-50 p-4"
          >
            <h3 className="font-semibold text-zinc-950">Catalog header</h3>
            <StorefrontConfigurationFields
              configuration={{
                key: "catalog_header",
                label: "Catalog header",
                description: "Catalog heading and empty-state copy.",
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
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <h3 className="font-semibold text-zinc-950">{configuration.label}</h3>
                    <p className="mt-1 text-xs text-zinc-500">{configuration.key}</p>
                  </div>
                  <StatusBadge tone={configuration.active ? "success" : "neutral"}>
                    {configuration.active ? "Active" : "Inactive"}
                  </StatusBadge>
                </div>
                <form action={upsertStorefrontConfiguration} className="grid gap-3">
                  <StorefrontConfigurationFields configuration={configuration} readOnlyKey />
                  <button className="min-h-10 rounded-md border border-zinc-300 px-3 text-xs font-semibold text-zinc-800 hover:border-emerald-600">
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
  return (
    <form action={upsertListingItem} className="grid gap-3">
      <input name="productId" type="hidden" value={product.id} />
      <input name="channels" type="hidden" value="b2c" />
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Title override" name="titleOverride" value={listing?.title_override ?? ""} placeholder={product.name} />
        <Field label="Badge" name="badgeLabel" value={listing?.badge_label ?? ""} placeholder="Featured or Preorder" />
      </div>
      <label className="grid gap-1 text-xs font-medium text-zinc-600">
        Tags
        <textarea
          className="min-h-20 rounded-md border border-zinc-300 px-2 py-2 text-sm"
          defaultValue={(listing?.tags ?? []).join(", ")}
          maxLength={800}
          name="tags"
          placeholder="Preorder, Limit 2"
        />
      </label>
      <div className="grid gap-3 md:grid-cols-3">
        <NumberField label="Max per customer" name="maxPerCustomer" value={listing?.max_per_customer ?? undefined} min={1} />
        <NumberField label="Preorder reserve" name="preorderReserve" value={listing?.preorder_reserve ?? 0} min={0} />
        <NumberField label="Sort priority" name="sortPriority" value={listing?.sort_priority ?? 0} />
      </div>
      <div className="flex flex-wrap gap-4 text-xs font-medium text-zinc-600">
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
      <button className="min-h-10 rounded-md border border-zinc-300 px-3 text-xs font-semibold text-zinc-800 hover:border-emerald-600">
        Save listing
      </button>
    </form>
  );
}

function Field({
  label,
  name,
  value,
  placeholder,
}: {
  label: string;
  name: string;
  value: string;
  placeholder?: string;
}) {
  return (
    <label className="grid gap-1 text-xs font-medium text-zinc-600">
      {label}
      <input
        className="min-h-10 rounded-md border border-zinc-300 px-2 text-sm"
        defaultValue={value}
        maxLength={180}
        name={name}
        placeholder={placeholder}
      />
    </label>
  );
}

function NumberField({
  label,
  name,
  value,
  min,
}: {
  label: string;
  name: string;
  value?: number;
  min?: number;
}) {
  return (
    <label className="grid gap-1 text-xs font-medium text-zinc-600">
      {label}
      <input
        className="min-h-10 rounded-md border border-zinc-300 px-2 text-sm"
        defaultValue={value}
        min={min}
        name={name}
        type="number"
      />
    </label>
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
  if (error) throw new Error(`Listing product lookup failed: ${error.message}`);
  return (data ?? []) as unknown as ProductRow[];
}

async function fetchStorefrontConfigurations(supabase: ReturnType<typeof createServiceClient>) {
  const { data, error } = await supabase
    .from("storefront_configurations")
    .select("key, label, description, value, active")
    .order("key");
  if (error) throw new Error(`Storefront configuration lookup failed: ${error.message}`);
  return (data ?? []) as unknown as StorefrontConfigurationRow[];
}
