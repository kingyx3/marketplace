import Link from "next/link";

import {
  AdminNumberField,
  AdminTextField,
} from "@/app/(shop)/control/_components/admin-form-fields";
import { MetricCard } from "@/app/_components/metric-card";
import { PageHeader } from "@/app/_components/page-header";
import { StatusBadge } from "@/app/_components/status-badge";
import { setSkuPrice } from "@/app/actions/pricing";
import { hasControlPermission, requireControlPermission } from "@/lib/control-access";
import { fetchControlProducts } from "@/lib/control-catalog";
import { formatMoney } from "@/lib/money";
import { createServiceClient } from "@/lib/supabase";

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
  const { staff } = await requireControlPermission("pricing.view", "/control/pricing");
  const supabase = createServiceClient();
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
  const canManage = hasControlPermission(staff, "pricing.manage");

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

      <section className="space-y-4">
        {skus.map((sku) => {
          const current = activeBySku.get(sku.skuId);
          return (
            <article
              className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm"
              key={sku.skuId}
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <Link
                    className="font-semibold text-zinc-950 hover:text-emerald-700"
                    href={`/control/catalog/products/${sku.productId}`}
                  >
                    {sku.productName}
                  </Link>
                  <p className="mt-1 text-xs text-zinc-500">{sku.sku}</p>
                </div>
                <StatusBadge tone={current ? "success" : "warning"}>
                  {current ? formatMoney(current.price_cents, current.currency) : "Price required"}
                </StatusBadge>
              </div>

              {canManage ? (
                <form
                  action={setSkuPrice}
                  className="mt-5 grid gap-3 sm:grid-cols-[10rem_10rem_8rem_auto] sm:items-end"
                >
                  <input name="skuId" type="hidden" value={sku.skuId} />
                  <AdminNumberField
                    defaultValue={current?.price_cents}
                    example="18900"
                    label="Selling price cents"
                    min={1}
                    name="priceCents"
                    required
                  />
                  <AdminNumberField
                    defaultValue={current?.compare_at_cents ?? undefined}
                    example="19900"
                    label="Compare-at cents"
                    min={1}
                    name="compareAtCents"
                  />
                  <AdminTextField
                    defaultValue={current?.currency ?? "SGD"}
                    example="SGD"
                    label="Currency"
                    maxLength={3}
                    minLength={3}
                    name="currency"
                    pattern="[A-Za-z]{3}"
                    required
                  />
                  <button className="min-h-11 rounded-md bg-zinc-950 px-5 text-sm font-semibold text-white hover:bg-emerald-700">
                    Save new price
                  </button>
                </form>
              ) : (
                <p className="mt-4 text-sm text-zinc-500">You have read-only pricing access.</p>
              )}
            </article>
          );
        })}
      </section>
    </div>
  );
}
