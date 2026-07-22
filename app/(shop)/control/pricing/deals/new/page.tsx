import { ControlBackLink } from "@/app/(shop)/control/_components/control-resource-ui";
import { DealForm, type DealProductOption } from "@/app/(shop)/control/_components/deal-form";
import { PageHeader } from "@/app/_components/page-header";
import { requireControlPermission } from "@/lib/control-access";
import { createSecretClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function NewDealPage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string }>;
}) {
  await requireControlPermission("pricing.manage", "/control/pricing/deals/new");
  const products = await fetchDealProducts();
  const conflict =
    (await searchParams)?.error === "duplicate-deal"
      ? "Another deal already uses this code. Choose a unique code."
      : undefined;

  return (
    <div className="space-y-8">
      <PageHeader
        action={<ControlBackLink href="/control/pricing/deals">Back to deals</ControlBackLink>}
        description="Create a truthful, time-bounded promotion using an exact deal price. Times are interpreted in Singapore time."
        eyebrow="Control · Deals"
        title="Create deal"
      />
      <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6">
        <DealForm error={conflict} products={products} />
      </section>
    </div>
  );
}

async function fetchDealProducts(): Promise<DealProductOption[]> {
  const { data, error } = await createSecretClient()
    .from("products")
    .select("id, reference_code, name, active, price_cents, currency")
    .order("reference_code", { ascending: true });
  if (error) throw new Error(`product lookup failed: ${error.message}`);

  return (
    (data ?? []) as unknown as Array<{
      id: string;
      reference_code: string;
      name: string;
      active: boolean;
      price_cents: number;
      currency: string;
    }>
  ).map((row) => {
    return {
      id: row.id,
      referenceCode: row.reference_code,
      active: row.active,
      productName: row.name,
      productActive: row.active,
      priceCents: Number(row.price_cents),
      currency: row.currency,
    };
  });
}
