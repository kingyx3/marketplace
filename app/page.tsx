import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

import { DealCard } from "@/app/_components/deal-card";
import { getCurrentViewer } from "@/lib/auth";
import { getCatalogProducts, type CatalogProduct } from "@/lib/catalog";
import { getStorefrontDeals } from "@/lib/deals";
import { formatMoney } from "@/lib/money";

export const dynamic = "force-dynamic";

export default async function HomePage({
  searchParams,
}: {
  searchParams?: Promise<{ account?: string }>;
}) {
  const params = (await searchParams) ?? {};
  const viewer = await getCurrentViewer();
  const signedIn = Boolean(viewer.user);
  const [catalog, deals] = await Promise.all([
    getCatalogProducts(),
    getStorefrontDeals({ signedIn, limit: 3 }),
  ]);
  const featuredProducts = (catalog ?? []).filter((product) => product.skus.length > 0).slice(0, 3);

  return (
    <div className="space-y-10 sm:space-y-14">
      {params.account === "deleted" ? (
        <div className="rounded-md border border-zinc-200 bg-white p-4 text-sm text-zinc-700 shadow-sm" role="status">
          Account deleted.
        </div>
      ) : null}

      <section className="relative isolate overflow-hidden rounded-xl bg-zinc-950 px-5 py-8 text-white shadow-sm sm:px-8 sm:py-10 lg:min-h-[520px] lg:px-12 lg:py-16">
        <Image
          src="/images/sealed-tcg-hero.png"
          alt="Sealed trading card booster boxes on a shop counter"
          fill
          priority
          className="absolute inset-0 -z-10 object-cover"
          sizes="100vw"
        />
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-zinc-950 via-zinc-950/85 to-zinc-900/20" />

        <div className="grid min-h-[340px] content-between gap-8 sm:min-h-[390px] sm:gap-10">
          <div className="max-w-2xl">
            <h1 className="max-w-2xl text-3xl font-bold leading-tight text-white sm:text-5xl lg:text-6xl">
              Sealed products, clear prices, no guesswork.
            </h1>
            <p className="mt-4 max-w-xl text-base leading-7 text-zinc-100 sm:mt-5 sm:text-lg">
              Shop current stock, reserve upcoming releases, and find limited-time deals.
            </p>
            <div className="mt-7 grid gap-3 sm:mt-8 sm:flex sm:flex-wrap">
              <Link
                href="/products"
                className="inline-flex min-h-11 w-full items-center justify-center rounded-md bg-white px-5 text-sm font-semibold text-zinc-950 hover:bg-emerald-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 sm:w-auto"
              >
                Browse products
              </Link>
              <Link
                href={signedIn ? "/account" : "/products?view=deals"}
                className="inline-flex min-h-11 w-full items-center justify-center rounded-md border border-white/60 px-5 text-sm font-semibold text-white hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 sm:w-auto"
              >
                {signedIn ? "Open account" : "View deals"}
              </Link>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <TrustPoint title="Upfront pricing">See prices before signing in.</TrustPoint>
            <TrustPoint title="Verified checkout">Stock and totals are rechecked at payment.</TrustPoint>
            <TrustPoint title="Secure accounts">Orders and preorders stay private.</TrustPoint>
          </div>
        </div>
      </section>

      <section>
        <SectionHeading
          eyebrow="Products"
          title="Featured products"
          href="/products"
          linkLabel="View products"
        />

        {featuredProducts.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3">
            {featuredProducts.map((product) => (
              <FeaturedProductCard key={product.id} product={product} />
            ))}
          </div>
        ) : (
          <EmptyState text="Products are temporarily unavailable. Try the products page again shortly." />
        )}
      </section>

      <section>
        <SectionHeading
          eyebrow="Deals"
          title={signedIn ? "Your eligible deals" : "Current offers"}
          href="/products?view=deals"
          linkLabel="View deals"
        />

        {deals.length > 0 ? (
          <div className="grid gap-4 sm:gap-5 md:grid-cols-2 xl:grid-cols-3">
            {deals.map((deal) => (
              <DealCard deal={deal} key={deal.id} />
            ))}
          </div>
        ) : (
          <EmptyState text="No active deals right now." />
        )}
      </section>

      <section aria-label="Customer information" className="grid gap-4 md:grid-cols-3">
        <InfoCard title="Delivery" href="/shipping" text="Rates and service are shown before payment." />
        <InfoCard title="Returns" href="/returns" text="Review sealed-product and preorder policies." />
        <InfoCard title="Privacy" href="/privacy" text="See how account and payment data is handled." />
      </section>
    </div>
  );
}

function SectionHeading({
  eyebrow,
  title,
  href,
  linkLabel,
}: {
  eyebrow: string;
  title: string;
  href: string;
  linkLabel: string;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3 sm:items-end">
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">{eyebrow}</p>
        <h2 className="mt-2 text-2xl font-bold text-zinc-950">{title}</h2>
      </div>
      <Link
        className="inline-flex min-h-11 items-center text-sm font-semibold text-emerald-700 hover:text-emerald-900"
        href={href}
      >
        {linkLabel}
      </Link>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-5 text-sm text-zinc-600 shadow-sm sm:p-6">
      {text}
    </div>
  );
}

function FeaturedProductCard({ product }: { product: CatalogProduct }) {
  const sku = product.skus[0];
  if (!sku) return null;

  return (
    <article className="grid overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <Link href={`/products/${product.slug}`} className="group block">
        <div className="relative aspect-[4/3] overflow-hidden bg-zinc-100">
          <Image
            alt={`${product.name} sealed product`}
            className="object-cover transition duration-300 group-hover:scale-[1.03]"
            fill
            sizes="(min-width: 768px) 33vw, 100vw"
            src={product.imageUrl ?? "/images/sealed-tcg-hero.png"}
          />
        </div>
      </Link>
      <div className="grid gap-3 p-4 sm:p-5">
        <p className="text-xs font-semibold uppercase text-zinc-500">
          {product.categoryName ?? "Trading card game"} · {product.setCode ?? sku.sku}
        </p>
        <h3 className="text-lg font-semibold text-zinc-950">
          <Link className="hover:text-emerald-700" href={`/products/${product.slug}`}>
            {product.name}
          </Link>
        </h3>
        <div>
          <p className="text-2xl font-bold text-zinc-950">
            {formatMoney(sku.priceCents, sku.currency)}
          </p>
          <p className="mt-1 text-xs text-zinc-500">{sku.available} available</p>
        </div>
      </div>
    </article>
  );
}

function TrustPoint({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-white/20 bg-white/10 p-4 backdrop-blur">
      <p className="font-semibold text-white">{title}</p>
      <p className="mt-2 text-sm leading-6 text-zinc-200">{children}</p>
    </div>
  );
}

function InfoCard({ title, text, href }: { title: string; text: string; href: string }) {
  return (
    <article className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-zinc-950">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-zinc-600">{text}</p>
      <Link
        className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-emerald-700 hover:text-emerald-900"
        href={href}
      >
        Read policy
      </Link>
    </article>
  );
}
