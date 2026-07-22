import Link from "next/link";

import { ControlEmptyState } from "@/app/(shop)/control/_components/control-resource-ui";
import { MetricCard } from "@/app/_components/metric-card";
import { PageHeader } from "@/app/_components/page-header";
import { StatusBadge } from "@/app/_components/status-badge";
import { requireControlPermission } from "@/lib/control-access";
import { fetchControlProducts } from "@/lib/control-catalog";
import { formatMoney } from "@/lib/money";
import { createSecretClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

interface PriceHistoryRow {
  id: string;
  product_id: string;
  currency: string;
  price_cents: number;
  compare_at_cents: number | null;
  active: boolean;
  starts_at: string;
  ends_at: string | null;
}

export default async function ControlPricingPage() {
  await requireControlPermission("pricing.view", "/control/pricing");
  const supabase = createSecretClient();
  const [products, pricesResult] = await Promise.all([
    fetchControlProducts(supabase),
    supabase
      .from("product_prices")
      .select("id, product_id, currency, price_cents, compare_at_cents, active, starts_at, ends_at")
      .order("starts_at", { ascending: false })
      .limit(500),
  ]);
  if (pricesResult.error) throw new Error(`Pricing query failed: ${pricesResult.error.message}`);

  const prices = (pricesResult.data ?? []) as PriceHistoryRow[];
  const activeByProduct = new Map(
    prices.filter((price) => price.active && !price.ends_at).map((price) => [price.product_id, price])
  );
  const priced = products.filter((product) => activeByProduct.has(product.id)).length;

  return (
    <div className="space-y-8">
      <PageHeader
        action={
          <Link
            className="inline-flex min-h-10 items-center rounded-md border border-zinc-300 px-4 text-sm font-semibold text-zinc-800 hover:border-emerald-600"
            href="/control/pricing/deals"
          >
            Open promotions
          </Link>
        }
        description="Manage versioned commercial prices independently from product identity, inventory, and publication."
        eyebrow="Control"
        title="Pricing"
      />

      <section className="grid gap-4 sm:grid-cols-3">
        <MetricCard label="Products" value={String(products.length)} detail="Sellable catalog records" />
        <MetricCard label="Priced" value={String(priced)} detail="Current active base price" />
        <MetricCard
          label="Unpriced"
          value={String(products.length - priced)}
          detail="Cannot be published"
        />
      </section>

      {products.length === 0 ? (
        <ControlEmptyState
          description="Create a product before configuring its active price."
          title="No products are available for pricing"
        />
      ) : (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-zinc-950">Product prices</h2>
            <span className="text-sm text-zinc-500">{products.length} records</span>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            {products.map((product) => {
              const current = activeByProduct.get(product.id);
              return (
                <Link
                  className="group flex min-h-full flex-col rounded-xl border border-zinc-200 bg-white p-5 shadow-sm transition hover:border-emerald-500 hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
                  href={`/control/pricing/products/${product.id}`}
                  key={product.id}
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <h3 className="break-words font-semibold text-zinc-950">{product.name}</h3>
                      <p className="mt-1 break-all font-mono text-xs text-zinc-500">{product.referenceCode ?? "Reference required"}</p>
                    </div>
                    <div className="shrink-0">
                      <StatusBadge tone={current ? "success" : "warning"}>
                        {current
                          ? formatMoney(current.price_cents, current.currency)
                          : "Price required"}
                      </StatusBadge>
                    </div>
                  </div>

                  <p className="mt-auto pt-5 text-sm font-semibold text-emerald-700 group-hover:text-emerald-800">
                    Open price record →
                  </p>
                </Link>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
