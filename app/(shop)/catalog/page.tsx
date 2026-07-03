import { PageHeader } from "@/app/_components/page-header";
import { ProductCard } from "@/app/_components/product-card";
import { StatusBadge } from "@/app/_components/status-badge";
import {
  getProduct,
  marketplaceProducts,
  type MarketplaceProduct,
  type SetStatus,
} from "@/app/_data/marketplace-fixtures";
import { hasSupabasePublicEnv } from "@/lib/env";
import { createAnonClient } from "@/lib/supabase";

// Always render at request time: the catalog reads live inventory and
// must not be frozen into the build. It also builds without DB creds.
export const dynamic = "force-dynamic";

interface CatalogRow {
  id: string;
  name: string;
  slug: string;
  product_type: string;
  description: string | null;
  language: string;
  image_url: string | null;
  sets_releases: {
    name: string;
    code: string;
    status: string;
    release_date: string | null;
  } | null;
  tcg_categories: {
    name: string;
    publisher: string | null;
  } | null;
  product_variants:
    | {
        booster_box_skus:
          | {
              sku: string;
              packs_per_box: number | null;
              cards_per_pack: number | null;
              msrp_cents: number | null;
              price_cents: number;
              currency: string;
              inventory:
                | {
                    on_hand: number;
                    incoming: number;
                    allocated: number;
                    safety_stock: number;
                  }[]
                | null;
            }[]
          | null;
      }[]
    | null;
}

function isSetStatus(value: string | undefined): value is SetStatus {
  return (
    value === "announced" ||
    value === "preorder_open" ||
    value === "preorder_closed" ||
    value === "released" ||
    value === "out_of_print"
  );
}

function normalizeRow(row: CatalogRow): MarketplaceProduct {
  const fixture = getProduct(row.slug);
  const sku = row.product_variants?.[0]?.booster_box_skus?.[0];
  const inventory = sku?.inventory?.[0];

  return {
    slug: row.slug,
    name: row.name,
    game: row.tcg_categories?.name ?? fixture?.game ?? "TCG",
    publisher: row.tcg_categories?.publisher ?? fixture?.publisher ?? "Publisher",
    setName: row.sets_releases?.name ?? fixture?.setName ?? "Set pending",
    setCode: row.sets_releases?.code ?? fixture?.setCode ?? "TBD",
    releaseDate: row.sets_releases?.release_date ?? fixture?.releaseDate ?? "TBD",
    setStatus: isSetStatus(row.sets_releases?.status)
      ? row.sets_releases.status
      : (fixture?.setStatus ?? "announced"),
    productType: row.product_type.replaceAll("_", " "),
    sku: sku?.sku ?? fixture?.sku ?? row.id,
    language: row.language ?? fixture?.language ?? "EN",
    priceCents: sku?.price_cents ?? fixture?.priceCents ?? 0,
    msrpCents: sku?.msrp_cents ?? fixture?.msrpCents ?? null,
    currency: sku?.currency ?? fixture?.currency ?? "SGD",
    packsPerBox: sku?.packs_per_box ?? fixture?.packsPerBox ?? 0,
    cardsPerPack: sku?.cards_per_pack ?? fixture?.cardsPerPack ?? 0,
    onHand: inventory?.on_hand ?? fixture?.onHand ?? 0,
    incoming: inventory?.incoming ?? fixture?.incoming ?? 0,
    allocated: inventory?.allocated ?? fixture?.allocated ?? 0,
    safetyStock: inventory?.safety_stock ?? fixture?.safetyStock ?? 0,
    preorderReserve: fixture?.preorderReserve ?? 0,
    maxPerCustomer: fixture?.maxPerCustomer ?? null,
    image: row.image_url ?? fixture?.image ?? "/images/sealed-tcg-hero.png",
    description: row.description ?? fixture?.description ?? "Sealed TCG product.",
    tags: fixture?.tags ?? ["Live catalog"],
    channels: fixture?.channels ?? ["b2c"],
  };
}

async function fetchProducts(): Promise<{ products: MarketplaceProduct[]; source: "live" | "preview" }> {
  if (!hasSupabasePublicEnv()) return { products: marketplaceProducts, source: "preview" };

  const supabase = createAnonClient();
  const { data, error } = await supabase
    .from("products")
    .select(
      `
        id,
        name,
        slug,
        product_type,
        description,
        language,
        image_url,
        sets_releases(name, code, status, release_date),
        tcg_categories(name, publisher),
        product_variants(
          booster_box_skus(
            sku,
            packs_per_box,
            cards_per_pack,
            msrp_cents,
            price_cents,
            currency,
            inventory(on_hand, incoming, allocated, safety_stock)
          )
        )
      `
    )
    .eq("active", true)
    .order("name")
    .limit(50);

  if (error) {
    console.error("catalog query failed:", error.message);
    return { products: marketplaceProducts, source: "preview" };
  }

  return {
    products: (data as unknown as CatalogRow[]).map(normalizeRow),
    source: "live",
  };
}

export default async function CatalogPage() {
  const { products, source } = await fetchProducts();

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Catalog"
        title="Sealed product inventory"
        description="Browse active booster boxes, collector boxes, cases, and preorders with visible stock and allocation limits."
        action={<StatusBadge tone={source === "live" ? "success" : "warning"}>{source} data</StatusBadge>}
      />

      <section className="grid gap-3 rounded-lg border border-zinc-200 bg-white p-4 shadow-sm md:grid-cols-[1fr_12rem_12rem_10rem]">
        <label className="grid gap-2 text-sm font-medium text-zinc-700">
          Search
          <input
            className="min-h-11 rounded-md border border-zinc-300 px-3 text-sm outline-none focus:border-emerald-600"
            placeholder="Set, game, SKU"
            type="search"
          />
        </label>
        <label className="grid gap-2 text-sm font-medium text-zinc-700">
          Game
          <select className="min-h-11 rounded-md border border-zinc-300 px-3 text-sm outline-none focus:border-emerald-600">
            <option>All games</option>
            <option>Magic</option>
            <option>Pokemon</option>
            <option>One Piece</option>
            <option>Lorcana</option>
          </select>
        </label>
        <label className="grid gap-2 text-sm font-medium text-zinc-700">
          Status
          <select className="min-h-11 rounded-md border border-zinc-300 px-3 text-sm outline-none focus:border-emerald-600">
            <option>All status</option>
            <option>Preorder open</option>
            <option>Released</option>
            <option>Announced</option>
          </select>
        </label>
        <div className="grid content-end">
          <button className="min-h-11 rounded-md bg-zinc-950 px-4 text-sm font-semibold text-white hover:bg-emerald-700">
            Apply
          </button>
        </div>
      </section>

      {products.length === 0 ? (
        <section className="rounded-lg border border-zinc-200 bg-white p-8 text-center shadow-sm">
          <h2 className="text-xl font-semibold text-zinc-950">No active products</h2>
          <p className="mt-3 text-sm text-zinc-600">Seed or publish a product before opening orders.</p>
        </section>
      ) : (
        <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {products.map((product) => (
            <ProductCard
              key={product.slug}
              product={product}
              sourceLabel={source === "live" ? "Live" : "Preview"}
            />
          ))}
        </section>
      )}
    </div>
  );
}
