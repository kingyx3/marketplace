import { notFound } from "next/navigation";

import {
  AdminNumberField,
  AdminTextField,
} from "@/app/(shop)/control/_components/admin-form-fields";
import {
  ControlActionForm,
  ControlBackLink,
  ControlData,
  ControlSaveButton,
} from "@/app/(shop)/control/_components/control-resource-ui";
import { PageHeader } from "@/app/_components/page-header";
import { StatusBadge } from "@/app/_components/status-badge";
import { setProductPrice } from "@/app/actions/pricing";
import { hasControlPermission, requireControlPermission } from "@/lib/control-access";
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

export default async function ProductPricePage({ params }: { params: Promise<{ productId: string }> }) {
  const { productId } = await params;
  const { staff } = await requireControlPermission(
    "pricing.view",
    `/control/pricing/products/${productId}`
  );
  const supabase = createSecretClient();
  const [products, pricesResult] = await Promise.all([
    fetchControlProducts(supabase),
    supabase
      .from("product_prices")
      .select("id, product_id, currency, price_cents, compare_at_cents, active, starts_at, ends_at")
      .eq("product_id", productId)
      .order("starts_at", { ascending: false }),
  ]);
  if (pricesResult.error)
    throw new Error(`Pricing history query failed: ${pricesResult.error.message}`);

  const product = products.find((candidate) => candidate.id === productId);
  if (!product) notFound();

  const prices = (pricesResult.data ?? []) as PriceHistoryRow[];
  const current = prices.find((price) => price.active && !price.ends_at);
  const canManage = hasControlPermission(staff, "pricing.manage");

  return (
    <div className="space-y-8">
      <PageHeader
        action={
          <>
            <StatusBadge tone={current ? "success" : "warning"}>
              {current ? "Priced" : "Price required"}
            </StatusBadge>
            <ControlBackLink href="/control/pricing">Back to pricing</ControlBackLink>
          </>
        }
        description={`${product.referenceCode ?? "Reference required"} · Pricing remains independent from catalog identity and inventory.`}
        eyebrow="Control · Pricing"
        title={product.name}
      />

      <section className="grid gap-4 sm:grid-cols-3">
        <Summary
          label="Current price"
          value={current ? formatMoney(current.price_cents, current.currency) : "Not set"}
        />
        <Summary
          label="Compare-at"
          value={
            current?.compare_at_cents
              ? formatMoney(current.compare_at_cents, current.currency)
              : "Not set"
          }
        />
        <Summary label="Price versions" value={String(prices.length)} />
      </section>

      {canManage ? (
        <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6">
          <h2 className="font-semibold text-zinc-950">Create price version</h2>
          <p className="mt-1 text-sm text-zinc-600">
            Saving closes the current version and creates a new auditable price.
          </p>
          <ControlActionForm
            action={setProductPrice}
            className="mt-5 grid gap-4 sm:grid-cols-2"
            confirmation={{
              title: "Create new price version?",
              description:
                "This closes the current price version and immediately creates an auditable replacement that can affect storefront orders.",
              confirmLabel: "Create price version",
            }}
            errorMessage="The new price could not be saved. Your price and currency entries have been preserved."
            successMessage="New price version created."
          >
            <input name="productId" type="hidden" value={productId} />
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
              min={(current?.price_cents ?? 0) + 1}
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
              patternMessage="Currency must be a 3-letter code, such as SGD."
              required
            />
            <div className="self-end">
              <ControlSaveButton pendingLabel="Saving price…">Save new price</ControlSaveButton>
            </div>
          </ControlActionForm>
        </section>
      ) : (
        <p className="rounded-xl border border-zinc-200 bg-white p-5 text-sm text-zinc-600">
          You have read-only pricing access.
        </p>
      )}

      {prices.length ? (
        <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="font-semibold text-zinc-950">Price history</h2>
          <div className="mt-4 divide-y divide-zinc-100">
            {prices.map((price) => (
              <div className="grid gap-2 py-3 text-sm sm:grid-cols-[1fr_auto_auto]" key={price.id}>
                <span className="font-medium text-zinc-950">
                  {formatMoney(price.price_cents, price.currency)}
                </span>
                <span className="text-zinc-500">{formatDate(price.starts_at)}</span>
                <span className="text-zinc-500">
                  {price.ends_at ? `Ended ${formatDate(price.ends_at)}` : "Current"}
                </span>
              </div>
            ))}
          </div>
        </section>
      ) : null}
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
