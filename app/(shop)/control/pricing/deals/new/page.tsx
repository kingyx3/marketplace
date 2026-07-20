import { ControlBackLink } from "@/app/(shop)/control/_components/control-resource-ui";
import { DealForm, type DealSkuOption } from "@/app/(shop)/control/_components/deal-form";
import { PageHeader } from "@/app/_components/page-header";
import { requireControlPermission } from "@/lib/control-access";
import { createServiceClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function NewDealPage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string }>;
}) {
  await requireControlPermission("pricing.manage", "/control/pricing/deals/new");
  const skus = await fetchDealSkus();
  const conflict =
    (await searchParams)?.error === "duplicate-deal"
      ? "Another deal already uses this code. Choose a unique code."
      : undefined;

  return (
    <div className="space-y-8">
      <PageHeader
        action={<ControlBackLink href="/control/pricing/deals">Back to deals</ControlBackLink>}
        description="Create a truthful, time-bounded promotion. Times are interpreted in Singapore time."
        eyebrow="Control · Deals"
        title="Create deal"
      />
      <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6">
        <DealForm error={conflict} skus={skus} />
      </section>
    </div>
  );
}

async function fetchDealSkus(): Promise<DealSkuOption[]> {
  const { data, error } = await createServiceClient()
    .from("booster_box_skus")
    .select("id, sku, active, product_variants!inner(products!inner(name, active))")
    .order("sku", { ascending: true });
  if (error) throw new Error(`SKU lookup failed: ${error.message}`);

  return (
    (data ?? []) as unknown as Array<{
      id: string;
      sku: string;
      active: boolean;
      product_variants:
        | { products: { name: string; active: boolean } | null }
        | Array<{ products: { name: string; active: boolean } | null }>
        | null;
    }>
  ).map((row) => {
    const variant = Array.isArray(row.product_variants)
      ? (row.product_variants[0] ?? null)
      : row.product_variants;
    return {
      id: row.id,
      sku: row.sku,
      active: row.active,
      productName: variant?.products?.name ?? "Unknown product",
      productActive: variant?.products?.active ?? false,
    };
  });
}
