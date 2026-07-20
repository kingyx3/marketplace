import { notFound } from "next/navigation";

import {
  ControlBackLink,
  ControlActionForm,
  ControlDangerButton,
  ControlData,
} from "@/app/(shop)/control/_components/control-resource-ui";
import {
  DealForm,
  type DealRecord,
  type DealSkuOption,
} from "@/app/(shop)/control/_components/deal-form";
import { PageHeader } from "@/app/_components/page-header";
import { StatusBadge } from "@/app/_components/status-badge";
import { setLimitedTimeDealActive } from "@/app/actions/admin";
import { hasControlPermission, requireControlPermission } from "@/lib/control-access";
import { createServiceClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function DealDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ dealId: string }>;
  searchParams?: Promise<{ saved?: string; error?: string }>;
}) {
  const { dealId } = await params;
  const { staff } = await requireControlPermission(
    "pricing.view",
    `/control/pricing/deals/${dealId}`
  );
  const canManage = hasControlPermission(staff, "pricing.manage");
  const canApprove = hasControlPermission(staff, "pricing.approve");
  const supabase = createServiceClient();
  const [dealResult, skuResult] = await Promise.all([
    supabase
      .from("limited_time_deals")
      .select(
        "id, code, sku_id, title, description, discount_bps, visibility, starts_at, ends_at, sort_priority, active"
      )
      .eq("id", dealId)
      .maybeSingle(),
    supabase
      .from("booster_box_skus")
      .select("id, sku, active, product_variants!inner(products!inner(name, active))")
      .order("sku", { ascending: true }),
  ]);

  if (dealResult.error) throw new Error(`Deal lookup failed: ${dealResult.error.message}`);
  if (skuResult.error) throw new Error(`SKU lookup failed: ${skuResult.error.message}`);
  if (!dealResult.data) notFound();

  const deal = dealResult.data as DealRecord;
  const skus = (
    (skuResult.data ?? []) as unknown as Array<{
      id: string;
      sku: string;
      active: boolean;
      product_variants:
        | { products: { name: string; active: boolean } | null }
        | Array<{ products: { name: string; active: boolean } | null }>
        | null;
    }>
  ).map((row): DealSkuOption => {
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
  const paramsValue = (await searchParams) ?? {};
  const conflict =
    paramsValue.error === "duplicate-deal"
      ? "Another deal already uses this code. Choose a unique code."
      : undefined;

  return (
    <div className="space-y-8">
      <PageHeader
        action={
          <>
            <StatusBadge tone={deal.active ? "success" : "warning"}>
              {deal.active ? "Active" : "Inactive"}
            </StatusBadge>
            <ControlBackLink href="/control/pricing/deals">Back to deals</ControlBackLink>
          </>
        }
        description={deal.code}
        eyebrow="Control · Deal"
        title={deal.title}
      />

      {paramsValue.saved === "1" ? (
        <div
          className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900"
          role="status"
        >
          Deal saved successfully.
        </div>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-3">
        <Summary label="Audience" value={deal.visibility} />
        <Summary label="Starts" value={formatDate(deal.starts_at)} />
        <Summary label="Ends" value={formatDate(deal.ends_at)} />
      </section>

      {canManage ? (
        <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6">
          <DealForm deal={deal} error={conflict} skus={skus} />
        </section>
      ) : null}

      {canApprove ? (
        <section className="rounded-xl border border-rose-100 bg-white p-5 shadow-sm">
          <h2 className="font-semibold text-zinc-950">Lifecycle</h2>
          <p className="mt-1 text-sm text-zinc-600">
            The scheduled window still controls storefront eligibility when a deal is active.
          </p>
          <ControlActionForm
            action={setLimitedTimeDealActive}
            className="mt-4"
            confirmation={{
              title: deal.active ? "Deactivate promotion?" : "Activate promotion?",
              description: deal.active
                ? "The discount will stop applying to new eligible orders. Existing orders are unaffected."
                : "The promotion can become customer-visible and affect eligible order pricing during its scheduled window.",
              confirmLabel: deal.active ? "Deactivate deal" : "Activate deal",
              tone: deal.active ? "danger" : "default",
            }}
            errorMessage="The promotion status could not be changed. Verify its schedule and pricing configuration."
            successMessage={`Promotion ${deal.active ? "deactivated" : "activated"}.`}
          >
            <input name="dealId" type="hidden" value={deal.id} />
            <input name="active" type="hidden" value={deal.active ? "false" : "true"} />
            <ControlDangerButton>
              {deal.active ? "Deactivate deal" : "Activate deal"}
            </ControlDangerButton>
          </ControlActionForm>
        </section>
      ) : (
        <section className="rounded-xl border border-zinc-200 bg-white p-5 text-sm text-zinc-500 shadow-sm">
          Promotion activation requires sensitive pricing approval.
        </section>
      )}
    </div>
  );
}

function Summary({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
      <ControlData label={label} value={value} />
    </div>
  );
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-SG", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Singapore",
  }).format(new Date(value));
}
