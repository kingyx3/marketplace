import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CartCheckoutPanel } from "@/app/(shop)/cart/checkout-panel";
import { WaitlistSignupPanel } from "@/app/(shop)/catalog/[slug]/waitlist-signup-panel";
import { PageHeader } from "@/app/_components/page-header";
import { StatusBadge } from "@/app/_components/status-badge";
import { Timeline } from "@/app/_components/timeline";
import { addToCart } from "@/app/actions/cart";
import {
  formatMoney,
  formatStatus,
  getAvailable,
  getProduct,
  type MarketplaceProduct,
} from "@/app/_data/marketplace-fixtures";
import { getCurrentViewer } from "@/lib/auth";
import { getCatalogProduct, type CatalogProduct } from "@/lib/catalog";
import { formatDealDiscount, getStorefrontDealForSku } from "@/lib/deals";
import { previewFixturesEnabled } from "@/lib/preview-fixtures";

type ProductPageProps = {
  params: Promise<{ slug: string }>;
};

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: ProductPageProps) {
  const { slug } = await params;
  const liveProduct = await getCatalogProduct(slug);
  const productName =
    liveProduct?.name ?? (previewFixturesEnabled() ? getProduct(slug)?.name : undefined);

  return {
    title: productName ?? "Product",
    description: liveProduct?.description ?? "Sealed trading card product details and availability.",
  };
}

export default async function ProductPage({ params }: ProductPageProps) {
  const { slug } = await params;
  const liveProduct = await getCatalogProduct(slug);
  const product = mergeProduct(
    liveProduct,
    previewFixturesEnabled() ? getProduct(slug) : undefined
  );
  if (!product) notFound();

  const viewer = await getCurrentViewer();
  const skuId = liveProduct?.skus[0]?.id ?? null;
  const activeDeal = skuId
    ? await getStorefrontDealForSku({ signedIn: Boolean(viewer.user), skuId })
    : null;
  const available = getAvailable(product);
  const preorderTimeline = [
    { label: "Paid in full", date: "Today", state: "current" as const },
    { label: "Allocation", date: "After supplier confirmation", state: "upcoming" as const },
    { label: "Shortfall refund", date: "If allocation is below your quantity", state: "upcoming" as const },
    { label: "Ship", date: `After ${product.releaseDate}`, state: "upcoming" as const },
  ];

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={`${product.game} · ${product.setCode}`}
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
          <div className="relative aspect-[16/10] overflow-hidden rounded-xl border border-zinc-200 bg-zinc-100 shadow-sm">
            <Image
              src={product.image}
              alt={`${product.name} sealed product display`}
              fill
              className="object-cover"
              sizes="(min-width: 1024px) 60vw, 100vw"
              priority
            />
          </div>

          <section className="grid gap-4 sm:grid-cols-2 md:grid-cols-4">
            <ProductFact label="SKU" value={product.sku} />
            <ProductFact label="Release" value={product.releaseDate} />
            <ProductFact label="Pack layout" value={`${product.packsPerBox} × ${product.cardsPerPack}`} />
            <ProductFact label="Language" value={product.language} />
          </section>

          <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
            <h2 className="text-xl font-semibold text-zinc-950">Availability</h2>
            <div className="mt-5 grid gap-4 sm:grid-cols-3">
              <Metric value={product.preorderReserve} label="Reserved for preorders" />
              <Metric value={product.maxPerCustomer ?? "Open"} label="Per-customer limit" />
              <Metric value={available} label="Available" />
            </div>
          </section>
        </div>

        <aside className="space-y-5">
          <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-medium text-zinc-500">Price</p>
            <p className="mt-2 text-4xl font-bold text-zinc-950">
              {formatMoney(product.priceCents, product.currency)}
            </p>
            <p className="mt-1 text-xs text-zinc-500">GST included where applicable</p>
            {product.msrpCents ? (
              <p className="mt-2 text-sm text-zinc-500">
                MSRP {formatMoney(product.msrpCents, product.currency)}
              </p>
            ) : null}
            {activeDeal ? (
              <div className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
                <p className="font-semibold">
                  Deal price {formatMoney(activeDeal.dealPriceCents, activeDeal.currency)}
                </p>
                <p className="mt-1 text-xs">Save {formatDealDiscount(activeDeal.discountBps)}</p>
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
                  href="/products"
                  className="inline-flex min-h-11 items-center justify-center rounded-md border border-zinc-300 px-5 text-sm font-semibold text-zinc-800 hover:border-zinc-500"
                >
                  Back to products
                </Link>
              )}
              {product.setStatus === "preorder_open" && skuId ? (
                <>
                  <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-950">
                    Preorders are charged 100% upfront. If confirmed supplier allocation is lower than your requested quantity, the difference is refunded through Stripe.
                  </div>
                  <CartCheckoutPanel
                    authRedirectPath={`/products/${product.slug}`}
                    clearCartOnSuccess={false}
                    items={[{ skuId, quantity: 1 }]}
                    mode="preorder"
                    publishableKey={process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? ""}
                    returnPath="/preorders?checkout=processing"
                    startLabel="Pay preorder in full"
                    successHref="/preorders"
                    successLabel="View preorders"
                    supabaseAnonKey={process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? ""}
                    supabaseUrl={process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""}
                  />
                </>
              ) : null}
              {skuId ? (
                <WaitlistSignupPanel
                  authRedirectPath={`/products/${product.slug}`}
                  inStock={available > 0}
                  skuId={skuId}
                  supabaseAnonKey={process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? ""}
                  supabaseUrl={process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""}
                />
              ) : null}
            </div>
          </section>

          {product.setStatus === "preorder_open" ? (
            <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-semibold text-zinc-950">Preorder timeline</h2>
              <div className="mt-5">
                <Timeline items={preorderTimeline} />
              </div>
            </section>
          ) : null}

          <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-zinc-950">Stock</h2>
            <dl className="mt-4 grid gap-3 text-sm">
              <StockRow label="On hand" value={product.onHand} />
              <StockRow label="Incoming" value={product.incoming} />
              <StockRow label="Allocated" value={product.allocated} />
            </dl>
          </section>
        </aside>
      </section>
    </div>
  );
}

function ProductFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
      <p className="text-sm text-zinc-500">{label}</p>
      <p className="mt-2 font-semibold text-zinc-950">{value}</p>
    </div>
  );
}

function Metric({ value, label }: { value: string | number; label: string }) {
  return (
    <div>
      <p className="text-3xl font-bold text-zinc-950">{value}</p>
      <p className="mt-1 text-sm text-zinc-600">{label}</p>
    </div>
  );
}

function StockRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-zinc-500">{label}</dt>
      <dd className="font-semibold text-zinc-950">{value}</dd>
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
    language: liveProduct?.language ?? fixture?.language ?? "EN",
    priceCents: sku?.priceCents ?? fixture?.priceCents ?? 0,
    msrpCents: sku?.msrpCents ?? fixture?.msrpCents ?? null,
    currency: sku?.currency ?? fixture?.currency ?? "SGD",
    packsPerBox: sku?.packsPerBox ?? fixture?.packsPerBox ?? 0,
    cardsPerPack: sku?.cardsPerPack ?? fixture?.cardsPerPack ?? 0,
    onHand: sku?.onHand ?? fixture?.onHand ?? 0,
    incoming: sku?.incoming ?? fixture?.incoming ?? 0,
    allocated: sku?.allocated ?? fixture?.allocated ?? 0,
    safetyStock: sku?.safetyStock ?? fixture?.safetyStock ?? 0,
    preorderReserve: liveProduct?.preorderReserve ?? fixture?.preorderReserve ?? 0,
    maxPerCustomer: liveProduct?.maxPerCustomer ?? fixture?.maxPerCustomer ?? null,
    image: liveProduct?.imageUrl ?? fixture?.image ?? "/images/sealed-tcg-hero.png",
    description: liveProduct?.description ?? fixture?.description ?? "Sealed TCG product.",
    tags: liveProduct?.tags.length ? liveProduct.tags : (fixture?.tags ?? ["Sealed product"]),
    channels: liveProduct?.channels.includes("b2c")
      ? ["b2c"]
      : fixture?.channels.includes("b2c")
        ? ["b2c"]
        : ["b2c"],
  };
}
