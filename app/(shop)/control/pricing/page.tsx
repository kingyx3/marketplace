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
  sku_id: string;
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
      .from("sku_prices")
      .select("id, sku_id, currency, price_cents, compare_at_cents, active, starts_at, ends_at")
      .order("starts_at", { ascending: false })
      .limit(500),
  ]);
  if (pricesResult.error) throw new Error(`Pricing query failed: ${pricesResult.error.message}`);

  const prices = (pricesResult.data ?? []) as PriceHistoryRow[];
  const activeBySku = new Map(
    prices.filter((price) => price.active && !price.ends_at).map((price) => [price.sku_id, price])
  );
  const skus = products.flatMap((product) =>
    product.skus.map((sku) => ({ ...sku, productName: product.name, productId: product.id }))
  );
  const priced = skus.filter((sku) => activeBySku.has(sku.skuId)).length;

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
        description="Manage versioned commercial prices independently from product identity, physical SKU data, inventory, and publication."
        eyebrow="Control"
        title="Pricing"
      />

      <section className="grid gap-4 sm:grid-cols-3">
        <MetricCard label="SKUs" value={String(skus.length)} detail="Physical sellable variants" />
        <MetricCard label="Priced" value={String(priced)} detail="Current active base price" />
        <MetricCard
          label="Unpriced"
          value={String(skus.length - priced)}
          detail="Cannot be published"
        />
      </section>

      {skus.length === 0 ? (
        <ControlEmptyState
          description="Create a product SKU before configuring its active price."
          title="No SKUs are available for pricing"
        />
      ) : (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-zinc-950">SKU prices</h2>
            <span className="text-sm text-zinc-500">{skus.length} records</span>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            {skus.map((sku) => {
              const current = activeBySku.get(sku.skuId);
              return (
                <Link
                  className="group flex min-h-full flex-col rounded-xl border border-zinc-200 bg-white p-5 shadow-sm transition hover:border-emerald-500 hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
                  href={`/control/pricing/skus/${sku.skuId}`}
                  key={sku.skuId}
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <h3 className="break-words font-semibold text-zinc-950">{sku.productName}</h3>
                      <p className="mt-1 break-all font-mono text-xs text-zinc-500">{sku.sku}</p>
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
