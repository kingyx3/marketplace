import Link from "next/link";
import { notFound } from "next/navigation";

import { CartCheckoutPanel } from "@/app/(shop)/cart/checkout-panel";
import { PageHeader } from "@/app/_components/page-header";
import { StatusBadge } from "@/app/_components/status-badge";
import { getCurrentUser } from "@/lib/auth";
import { getSkuQuote } from "@/lib/catalog";
import { getStorefrontDealForSku } from "@/lib/deals";
import { applicationUrl } from "@/lib/hitpay";
import { formatMoney } from "@/lib/money";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Buy now",
  robots: { index: false, follow: false },
};

export default async function BuyNowPage({
  searchParams,
}: {
  searchParams?: Promise<{ sku?: string; quantity?: string }>;
}) {
  const params = (await searchParams) ?? {};
  const skuId = validSkuId(params.sku);
  const quantity = validQuantity(params.quantity);
  if (!skuId || !quantity) notFound();

  const items = [{ skuId, quantity }];
  const user = await getCurrentUser();
  const quote = await getSkuQuote(items).catch(() => null);
  const line = quote?.lines.find((item) => item.skuId === skuId);
  if (!quote || !line) notFound();

  const deal = await getStorefrontDealForSku({ signedIn: Boolean(user), skuId });
  const unitPriceCents = deal?.dealPriceCents ?? line.unitPriceCents;
  const merchandiseTotalCents = unitPriceCents * quantity;
  const gstCents = Math.round((merchandiseTotalCents * 9) / 109);
  const hasAvailabilityIssue = line.available < quantity;
  const checkoutPath = `/buy-now?${new URLSearchParams({
    sku: skuId,
    quantity: String(quantity),
  }).toString()}#checkout`;
  const recipientName = authenticatedDisplayName(user?.user_metadata);

  return (
    <div className="space-y-6 sm:space-y-8">
      <PageHeader
        eyebrow="Buy now"
        title="Complete your purchase"
        description="Review this item and continue directly to secure HitPay checkout. Your saved cart is unchanged."
      />

      {hasAvailabilityIssue ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          Only {line.available} {line.available === 1 ? "unit is" : "units are"} currently available.
          Return to the product page and choose a lower quantity.
        </div>
      ) : null}

      <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <article className="h-fit rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Direct checkout
              </p>
              <h2 className="mt-2 break-words text-xl font-semibold text-zinc-950">{line.name}</h2>
              <p className="mt-2 text-sm text-zinc-600">
                Quantity {quantity} · {formatMoney(unitPriceCents, line.currency)} each
              </p>
            </div>
            <StatusBadge tone={hasAvailabilityIssue ? "warning" : "success"}>
              {hasAvailabilityIssue ? `Only ${line.available} available` : "In stock"}
            </StatusBadge>
          </div>

          {deal ? (
            <div className="mt-5 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
              Your eligible deal price is applied to this direct checkout.
            </div>
          ) : null}

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <Link
              className="inline-flex min-h-11 items-center justify-center rounded-md border border-zinc-300 px-4 text-sm font-semibold text-zinc-800 hover:border-zinc-500"
              href="/cart"
            >
              View saved cart
            </Link>
            <Link
              className="inline-flex min-h-11 items-center justify-center rounded-md border border-zinc-300 px-4 text-sm font-semibold text-zinc-800 hover:border-zinc-500"
              href="/products"
            >
              Keep shopping
            </Link>
          </div>
        </article>

        <aside
          className="h-fit scroll-mt-28 rounded-lg border border-zinc-200 bg-white p-4 shadow-sm sm:p-5 lg:sticky lg:top-28"
          id="checkout"
        >
          <h2 className="text-xl font-semibold text-zinc-950">Order summary</h2>
          <dl className="mt-5 grid gap-3 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-zinc-500">Items</dt>
              <dd className="font-semibold text-zinc-950">
                {formatMoney(merchandiseTotalCents, line.currency)}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-zinc-500">Shipping</dt>
              <dd className="text-right font-semibold text-zinc-950">Calculated before payment</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-zinc-500">GST included</dt>
              <dd className="font-semibold text-zinc-950">
                {formatMoney(gstCents, line.currency)}
              </dd>
            </div>
            <div className="mt-3 border-t border-zinc-200 pt-4">
              <div className="flex justify-between gap-4">
                <dt className="text-base font-semibold text-zinc-950">Items total</dt>
                <dd className="text-xl font-bold text-zinc-950">
                  {formatMoney(merchandiseTotalCents, line.currency)}
                </dd>
              </div>
            </div>
          </dl>

          {user ? (
            <CartCheckoutPanel
              authRedirectPath={checkoutPath}
              disabled={hasAvailabilityIssue}
              initialRecipientName={recipientName}
              items={items}
              paymentBody={{
                mode: "order",
                channel: "b2c",
                items,
                successUrl: applicationUrl("/orders"),
              }}
              startLabel="Buy now with HitPay"
              supabaseAnonKey={process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? ""}
              supabaseUrl={process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""}
            />
          ) : (
            <div className="mt-6 grid gap-3 rounded-md border border-emerald-200 bg-emerald-50 p-4">
              <div>
                <p className="font-semibold text-emerald-950">Sign in to buy now</p>
                <p className="mt-1 text-sm leading-6 text-emerald-900">
                  Your account keeps the order, payment status, and delivery details linked to you.
                </p>
              </div>
              <Link
                className="inline-flex min-h-11 items-center justify-center rounded-md bg-zinc-950 px-4 text-sm font-semibold text-white hover:bg-emerald-700"
                href={`/sign-in?next=${encodeURIComponent(checkoutPath)}`}
              >
                Sign in to continue
              </Link>
            </div>
          )}
        </aside>
      </section>
    </div>
  );
}

function validSkuId(value: string | undefined): string | null {
  if (!value) return null;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  )
    ? value
    : null;
}

function validQuantity(value: string | undefined): number | null {
  const quantity = Number(value ?? 1);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 24) return null;
  return quantity;
}

function authenticatedDisplayName(metadata: Record<string, unknown> | undefined): string {
  const directName = metadata?.full_name ?? metadata?.name;
  if (typeof directName === "string" && directName.trim()) return directName.trim();

  const givenName = typeof metadata?.given_name === "string" ? metadata.given_name.trim() : "";
  const familyName = typeof metadata?.family_name === "string" ? metadata.family_name.trim() : "";
  return [givenName, familyName].filter(Boolean).join(" ");
}
