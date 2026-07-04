import Image from "next/image";
import Link from "next/link";
import { MetricCard } from "@/app/_components/metric-card";
import { ProductCard } from "@/app/_components/product-card";
import { StatusBadge } from "@/app/_components/status-badge";
import {
  adminMetrics,
  formatMoney,
  getAvailable,
  marketplaceProducts,
  preorders,
} from "@/app/_data/marketplace-fixtures";

export default function HomePage() {
  const featuredProducts = marketplaceProducts.slice(0, 3);
  const balanceDue = preorders.reduce((total, preorder) => total + preorder.balanceCents, 0);

  return (
    <div className="space-y-12">
      <section className="relative isolate overflow-hidden rounded-lg bg-zinc-950 px-5 py-10 text-white sm:px-8 lg:min-h-[520px] lg:px-12 lg:py-16">
        <Image
          src="/images/sealed-tcg-hero.png"
          alt="Sealed trading card booster boxes on a shop counter"
          fill
          priority
          className="absolute inset-0 -z-10 object-cover"
          sizes="100vw"
        />
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-zinc-950 via-zinc-950/80 to-zinc-900/20" />

        <div className="grid min-h-[420px] content-between gap-10">
          <div className="max-w-2xl">
            <StatusBadge tone="success">Preorders open</StatusBadge>
            <h1 className="mt-5 max-w-2xl text-4xl font-bold text-white sm:text-5xl lg:text-6xl">
              Sealed booster boxes with allocation people can see.
            </h1>
            <p className="mt-5 max-w-xl text-base leading-7 text-zinc-100 sm:text-lg">
              Retail drops, wholesale cases, deposit-backed preorders, and order tracking for
              players, collectors, and approved stores.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/catalog"
                className="inline-flex min-h-11 items-center justify-center rounded-md bg-white px-5 text-sm font-semibold text-zinc-950 hover:bg-emerald-100"
              >
                Browse catalog
              </Link>
              <Link
                href="/preorders"
                className="inline-flex min-h-11 items-center justify-center rounded-md border border-white/60 px-5 text-sm font-semibold text-white hover:bg-white/10"
              >
                Track preorders
              </Link>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            {featuredProducts.map((product) => (
              <Link
                href={`/catalog/${product.slug}`}
                key={product.slug}
                className="rounded-lg border border-white/20 bg-white/10 p-4 backdrop-blur transition hover:bg-white/15"
              >
                <p className="text-sm font-semibold text-white">{product.setCode}</p>
                <p className="mt-1 text-sm text-zinc-200">{product.productType}</p>
                <p className="mt-3 text-xl font-bold text-white">
                  {formatMoney(product.priceCents, product.currency)}
                </p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {adminMetrics.map((metric) => (
          <MetricCard key={metric.label} {...metric} />
        ))}
      </section>

      <section className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div>
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-2xl font-bold text-zinc-950">Active sealed product</h2>
              <p className="mt-2 text-sm text-zinc-600">
                Price, limits, and allocation status are visible before a buyer commits.
              </p>
            </div>
            <Link href="/catalog" className="text-sm font-semibold text-emerald-700 hover:text-emerald-900">
              View all
            </Link>
          </div>
          <div className="grid gap-5 md:grid-cols-3">
            {featuredProducts.map((product) => (
              <ProductCard key={product.slug} product={product} sourceLabel="Preview" />
            ))}
          </div>
        </div>

        <aside className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-zinc-950">Customer snapshot</h2>
          <div className="mt-5 grid gap-4">
            <div className="rounded-md bg-emerald-50 p-4">
              <p className="text-sm font-medium text-emerald-800">Balance due</p>
              <p className="mt-2 text-3xl font-bold text-zinc-950">{formatMoney(balanceDue)}</p>
            </div>
            {featuredProducts.slice(0, 2).map((product) => (
              <div
                key={product.slug}
                className="flex items-center justify-between gap-3 border-b border-zinc-100 pb-4"
              >
                <div>
                  <p className="font-medium text-zinc-950">{product.setCode}</p>
                  <p className="text-sm text-zinc-500">{product.name}</p>
                </div>
                <StatusBadge tone={getAvailable(product) > 0 ? "success" : "warning"}>
                  {getAvailable(product)} open
                </StatusBadge>
              </div>
            ))}
            <Link
              href="/account"
              className="inline-flex min-h-11 items-center justify-center rounded-md bg-zinc-950 px-4 text-sm font-semibold text-white hover:bg-emerald-700"
            >
              Open account
            </Link>
          </div>
        </aside>
      </section>
    </div>
  );
}
