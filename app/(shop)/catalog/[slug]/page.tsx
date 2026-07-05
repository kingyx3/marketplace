import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/app/_components/page-header";
import { StatusBadge } from "@/app/_components/status-badge";
import { Timeline } from "@/app/_components/timeline";
import { CartCheckoutPanel } from "@/app/(shop)/cart/checkout-panel";
import { WaitlistSignupPanel } from "@/app/(shop)/catalog/[slug]/waitlist-signup-panel";
import { addToCart } from "@/app/actions/cart";
import { getAppName } from "@/lib/app-config";
import { getCurrentUser, getCustomerProfile } from "@/lib/auth";
import {
  discountedPriceCents,
  formatDiscountBps,
  getWholesaleAccess,
  maxDiscountBps,
  minimumOrderCents,
  type WholesaleAccess,
} from "@/lib/b2b";
import { formatMoney as formatSharedMoney } from "@/lib/money";
import {
  formatMoney,
  formatStatus,
  getAvailable,
  getProduct,
  type MarketplaceProduct,
} from "@/app/_data/marketplace-fixtures";
import { getCatalogProduct, type CatalogProduct } from "@/lib/catalog";
import { createServiceClient } from "@/lib/supabase";

type ProductPageProps = {
  params: Promise<{ slug: string }>;
};

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: ProductPageProps) {
  const { slug } = await params;
  const product = getProduct(slug);
  const appName = getAppName();

  return {
    title: product ? `${product.name} | ${appName}` : `Product | ${appName}`,
  };
}

export default async function ProductPage({ params }: ProductPageProps) {
  const { slug } = await params;
  const liveProduct = await getCatalogProduct(slug);
  const product = mergeProduct(liveProduct, getProduct(slug));
  if (!product) notFound();

  const wholesaleAccess = await currentWholesaleAccess();
  const wholesaleDiscountBps = maxDiscountBps(wholesaleAccess?.tiers ?? []);
  const wholesaleMinimumCents = minimumOrderCents(wholesaleAccess?.tiers ?? []);
  const wholesalePriceCents =
    wholesaleDiscountBps > 0
      ? discountedPriceCents(product.priceCents, wholesaleDiscountBps)
      : product.priceCents;
  const available = getAvailable(product);
  const skuId = liveProduct?.skus[0]?.id ?? null;
  const preorderTimeline = [
    { label: "Deposit", date: "Today", state: "current" as const },
    { label: "Allocation", date: "After supplier confirmation", state: "upcoming" as const },
    { label: "Balance", date: "When allocated", state: "upcoming" as const },
    { label: "Ship", date: `After ${product.releaseDate}`, state: "upcoming" as const },
  ];

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={`${product.game} / ${product.setCode}`}
        title={product.name}
        description={product.description}
        action={
          <StatusBadge tone={product.setStatus === "preorder_open" ? "success" : "neutral"}>
            {formatStatus(product.setStatus)}
          </StatusBadge>
        }
      />

      <section className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="space-y-6">
          <div className="relative aspect-[16/10] overflow-hidden rounded-lg border border-zinc-200 bg-zinc-100 shadow-sm">
            <Image
              src={product.image}
              alt={`${product.name} sealed product display`}
              fill
              className="object-cover"
              sizes="(min-width: 1024px) 60vw, 100vw"
              priority
            />
          </div>

          <section className="grid gap-4 md:grid-cols-4">
            <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
              <p className="text-sm text-zinc-500">SKU</p>
              <p className="mt-2 font-semibold text-zinc-950">{product.sku}</p>
            </div>
            <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
              <p className="text-sm text-zinc-500">Release</p>
              <p className="mt-2 font-semibold text-zinc-950">{product.releaseDate}</p>
            </div>
            <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
              <p className="text-sm text-zinc-500">Pack layout</p>
              <p className="mt-2 font-semibold text-zinc-950">
                {product.packsPerBox} x {product.cardsPerPack}
              </p>
            </div>
            <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
              <p className="text-sm text-zinc-500">Language</p>
              <p className="mt-2 font-semibold text-zinc-950">{product.language}</p>
            </div>
          </section>

          <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
            <h2 className="text-xl font-semibold text-zinc-950">Allocation policy</h2>
            <div className="mt-5 grid gap-4 md:grid-cols-3">
              <div>
                <p className="text-3xl font-bold text-zinc-950">{product.preorderReserve}</p>
                <p className="mt-1 text-sm text-zinc-600">B2C reserve boxes</p>
              </div>
              <div>
                <p className="text-3xl font-bold text-zinc-950">
                  {product.maxPerCustomer ?? "Open"}
                </p>
                <p className="mt-1 text-sm text-zinc-600">Per-customer cap</p>
              </div>
              <div>
                <p className="text-3xl font-bold text-zinc-950">{available}</p>
                <p className="mt-1 text-sm text-zinc-600">Available after safety stock</p>
              </div>
            </div>
          </section>
        </div>

        <aside className="space-y-5">
          <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-medium text-zinc-500">Current price</p>
            <p className="mt-2 text-4xl font-bold text-zinc-950">
              {formatMoney(product.priceCents, product.currency)}
            </p>
            {product.msrpCents ? (
              <p className="mt-2 text-sm text-zinc-500">
                MSRP {formatMoney(product.msrpCents, product.currency)}
              </p>
            ) : null}
            {wholesaleDiscountBps > 0 ? (
              <div className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
                <p className="font-semibold">
                  Approved wholesale price {formatMoney(wholesalePriceCents, product.currency)}
                </p>
                <p className="mt-1 text-xs">
                  {formatDiscountBps(wholesaleDiscountBps)} off list after the{" "}
                  {formatSharedMoney(wholesaleMinimumCents, product.currency)} wholesale minimum.
                </p>
              </div>
            ) : null}
            <div className="mt-5 grid gap-2">
              {skuId ? (
                <form action={addToCart} className="grid gap-3">
                  <input type="hidden" name="skuId" value={skuId} />
                  <label className="grid gap-2 text-sm font-medium text-zinc-700">
                    Quantity
                    <input
                      className="min-h-11 rounded-md border border-zinc-300 px-3 text-sm"
                      defaultValue={1}
                      min={1}
                      max={product.maxPerCustomer ?? 24}
                      name="quantity"
                      type="number"
                    />
                  </label>
                  <button className="inline-flex min-h-11 items-center justify-center rounded-md bg-zinc-950 px-5 text-sm font-semibold text-white hover:bg-emerald-700">
                    Add to cart
                  </button>
                </form>
              ) : (
                <Link
                  href="/catalog"
                  className="inline-flex min-h-11 items-center justify-center rounded-md bg-zinc-950 px-5 text-sm font-semibold text-white hover:bg-emerald-700"
                >
                  Configure database to order
                </Link>
              )}
              {product.setStatus === "preorder_open" ? (
                skuId ? (
                  <CartCheckoutPanel
                    authRedirectPath={`/catalog/${product.slug}`}
                    clearCartOnSuccess={false}
                    items={[{ skuId, quantity: 1 }]}
                    mode="preorder"
                    publishableKey={process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? ""}
                    returnPath="/preorders?checkout=processing"
                    startLabel="Pay preorder deposit"
                    successHref="/preorders"
                    successLabel="View preorders"
                    supabaseAnonKey={process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ""}
                    supabaseUrl={process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""}
                  />
                ) : null
              ) : null}
              {skuId ? (
                <WaitlistSignupPanel
                  authRedirectPath={`/catalog/${product.slug}`}
                  inStock={available > 0}
                  skuId={skuId}
                  supabaseAnonKey={process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ""}
                  supabaseUrl={process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""}
                />
              ) : null}
            </div>
          </section>

          <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-zinc-950">Preorder flow</h2>
            <div className="mt-5">
              <Timeline items={preorderTimeline} />
            </div>
          </section>

          <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-zinc-950">Fulfillment</h2>
            <dl className="mt-4 grid gap-3 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-zinc-500">On hand</dt>
                <dd className="font-semibold text-zinc-950">{product.onHand}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-zinc-500">Incoming</dt>
                <dd className="font-semibold text-zinc-950">{product.incoming}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-zinc-500">Allocated</dt>
                <dd className="font-semibold text-zinc-950">{product.allocated}</dd>
              </div>
            </dl>
          </section>
        </aside>
      </section>
    </div>
  );
}

function mergeProduct(
  liveProduct: CatalogProduct | null,
  fixture: MarketplaceProduct | undefined
): MarketplaceProduct | null {
  if (!liveProduct && !fixture) return null;
  const sku = liveProduct?.skus[0];

  return {
    slug: liveProduct?.slug ?? fixture!.slug,
    name: liveProduct?.name ?? fixture!.name,
    game: liveProduct?.categoryName ?? fixture?.game ?? "TCG",
    publisher: fixture?.publisher ?? "Publisher",
    setName: liveProduct?.setName ?? fixture?.setName ?? "Set pending",
    setCode: liveProduct?.setCode ?? fixture?.setCode ?? "TBD",
    releaseDate: liveProduct?.releaseDate ?? fixture?.releaseDate ?? "TBD",
    setStatus:
      (liveProduct?.setStatus as MarketplaceProduct["setStatus"] | null) ??
      fixture?.setStatus ??
      "announced",
    productType:
      liveProduct?.productType.replaceAll("_", " ") ?? fixture?.productType ?? "Booster box",
    sku: sku?.sku ?? fixture?.sku ?? "SKU",
    language: fixture?.language ?? "EN",
    priceCents: sku?.priceCents ?? fixture?.priceCents ?? 0,
    msrpCents: fixture?.msrpCents ?? null,
    currency: sku?.currency ?? fixture?.currency ?? "SGD",
    packsPerBox: fixture?.packsPerBox ?? 0,
    cardsPerPack: fixture?.cardsPerPack ?? 0,
    onHand: sku?.available ?? fixture?.onHand ?? 0,
    incoming: sku?.incoming ?? fixture?.incoming ?? 0,
    allocated: fixture?.allocated ?? 0,
    safetyStock: fixture?.safetyStock ?? 0,
    preorderReserve: fixture?.preorderReserve ?? 0,
    maxPerCustomer: fixture?.maxPerCustomer ?? null,
    image: liveProduct?.imageUrl ?? fixture?.image ?? "/images/sealed-tcg-hero.png",
    description: liveProduct?.description ?? fixture?.description ?? "Sealed TCG product.",
    tags: fixture?.tags ?? ["Live catalog"],
    channels: fixture?.channels ?? ["b2c"],
  };
}

async function currentWholesaleAccess(): Promise<WholesaleAccess | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  const customer = await getCustomerProfile(user.id);
  if (!customer) return null;

  try {
    const access = await getWholesaleAccess(createServiceClient(), customer.id);
    return access.status === "approved" && access.tiers.length > 0 ? access : null;
  } catch (error) {
    console.error("product wholesale pricing lookup failed:", safeError(error));
    return null;
  }
}

function safeError(error: unknown): string {
  return error instanceof Error ? error.message : "unknown";
}
