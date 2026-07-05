import Link from "next/link";

import { PageHeader } from "@/app/_components/page-header";
import { StatusBadge } from "@/app/_components/status-badge";
import { CartCheckoutPanel } from "@/app/(shop)/cart/checkout-panel";
import { removeFromCart, updateCartQuantity } from "@/app/actions/cart";
import { getCurrentUser, getCustomerProfile } from "@/lib/auth";
import {
  bestDiscountBpsForSubtotal,
  discountedPriceCents,
  formatDiscountBps,
  getWholesaleAccess,
  minimumOrderCents,
  wholesaleIsActive,
  type WholesaleAccess,
} from "@/lib/b2b";
import { readCart } from "@/lib/cart";
import { getSkuQuote } from "@/lib/catalog";
import { calculateDiscountCents, type SalesChannel } from "@/lib/commerce";
import { formatMoney } from "@/lib/money";
import { createServiceClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function CartPage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string; checkout?: string; order?: string; channel?: string }>;
}) {
  const params = (await searchParams) ?? {};
  const cartItems = await readCart();
  const wholesaleAccess = await currentWholesaleAccess();
  const hasWholesaleAccess = wholesaleIsActive(wholesaleAccess);
  const requestedChannel = params.channel === "b2b" ? "b2b" : "b2c";
  const selectedChannel: SalesChannel =
    requestedChannel === "b2b" && hasWholesaleAccess ? "b2b" : "b2c";
  const requestedUnavailableWholesale = requestedChannel === "b2b" && !hasWholesaleAccess;
  let quote;
  let quoteError: string | null = null;

  try {
    quote = await getSkuQuote(cartItems);
  } catch (error) {
    quote = { lines: [], subtotalCents: 0, currency: "SGD" };
    quoteError = error instanceof Error ? error.message : "Unable to quote cart";
  }

  const wholesaleMinimum = minimumOrderCents(wholesaleAccess?.tiers ?? []);
  const discountBps =
    selectedChannel === "b2b"
      ? bestDiscountBpsForSubtotal(wholesaleAccess?.tiers ?? [], quote.subtotalCents)
      : 0;
  const belowWholesaleMinimum =
    selectedChannel === "b2b" && wholesaleMinimum > 0 && quote.subtotalCents < wholesaleMinimum;
  const discountCents =
    selectedChannel === "b2b" && !belowWholesaleMinimum
      ? calculateDiscountCents(quote.subtotalCents, discountBps)
      : 0;
  const totalDueCents = quote.subtotalCents - discountCents;
  const gst = Math.round((totalDueCents * 9) / 109);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Cart"
        title="Review sealed product order"
        description="The cart stores only SKU IDs and quantities. Prices, availability, and payment totals are recalculated on the server before payment."
        action={
          <StatusBadge tone={quote.lines.length > 0 ? "success" : "warning"}>
            {quote.lines.length} line(s)
          </StatusBadge>
        }
      />

      {params.error ? (
        <div className="rounded-md border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          Checkout could not continue: {params.error}
        </div>
      ) : null}
      {params.checkout === "cancelled" ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Payment was cancelled. Your cart is still here.
        </div>
      ) : null}
      {params.checkout === "processing" ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Payment is processing. Your order will update after Stripe confirms it.
        </div>
      ) : null}
      {params.checkout === "failed" ? (
        <div className="rounded-md border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          Payment was not completed. Try again when you are ready.
        </div>
      ) : null}
      {quoteError ? (
        <div className="rounded-md border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          {quoteError}
        </div>
      ) : null}
      {requestedUnavailableWholesale ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Wholesale checkout requires an approved account with an assigned pricing tier.
        </div>
      ) : null}
      {wholesaleAccess?.status === "approved" && !hasWholesaleAccess ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Your wholesale account is approved, but staff still needs to assign a pricing tier before
          B2B checkout is available.
        </div>
      ) : null}
      {hasWholesaleAccess ? (
        <section className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold text-zinc-950">Checkout channel</h2>
              <p className="mt-1 text-sm text-zinc-600">
                Wholesale pricing uses your approved tier and is revalidated at payment.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Link
                className={channelLinkClass(selectedChannel === "b2c")}
                href="/cart?channel=b2c"
              >
                Retail
              </Link>
              <Link
                className={channelLinkClass(selectedChannel === "b2b")}
                href="/cart?channel=b2b"
              >
                Wholesale
              </Link>
            </div>
          </div>
        </section>
      ) : null}

      {quote.lines.length === 0 ? (
        <section className="rounded-lg border border-zinc-200 bg-white p-8 text-center shadow-sm">
          <h2 className="text-xl font-semibold text-zinc-950">Your cart is empty</h2>
          <p className="mt-3 text-sm text-zinc-600">
            Add an in-stock or incoming sealed product to start checkout.
          </p>
          <Link
            href="/catalog"
            className="mt-6 inline-flex min-h-11 items-center justify-center rounded-md bg-zinc-950 px-5 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            Browse catalog
          </Link>
        </section>
      ) : (
        <section className="grid gap-6 lg:grid-cols-[1fr_24rem]">
          <div className="space-y-4">
            {quote.lines.map((line) => (
              <article
                key={line.skuId}
                className="grid gap-4 rounded-lg border border-zinc-200 bg-white p-4 shadow-sm sm:grid-cols-[1fr_auto] sm:items-center"
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-semibold text-zinc-950">{line.name}</h2>
                    <StatusBadge tone={line.available >= line.quantity ? "success" : "warning"}>
                      {line.available} available
                    </StatusBadge>
                  </div>
                  <p className="mt-2 text-sm text-zinc-500">{line.sku}</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <form action={updateCartQuantity} className="flex items-end gap-2">
                      <input type="hidden" name="skuId" value={line.skuId} />
                      <label className="grid gap-1 text-sm font-medium text-zinc-700">
                        Quantity
                        <input
                          className="min-h-11 w-24 rounded-md border border-zinc-300 px-3 text-sm"
                          defaultValue={line.quantity}
                          min={1}
                          max={24}
                          name="quantity"
                          type="number"
                        />
                      </label>
                      <button className="min-h-11 rounded-md border border-zinc-300 px-4 text-sm font-semibold text-zinc-800 hover:border-zinc-500">
                        Update
                      </button>
                    </form>
                    <form action={removeFromCart} className="grid content-end">
                      <input type="hidden" name="skuId" value={line.skuId} />
                      <button className="min-h-11 rounded-md border border-rose-200 px-4 text-sm font-semibold text-rose-700 hover:border-rose-400">
                        Remove
                      </button>
                    </form>
                  </div>
                </div>
                <div className="text-left sm:text-right">
                  <p className="text-xl font-bold text-zinc-950">
                    {formatMoney(line.lineTotalCents, line.currency)}
                  </p>
                  <p className="mt-1 text-sm text-zinc-500">
                    {formatMoney(line.unitPriceCents, line.currency)} each
                  </p>
                  {selectedChannel === "b2b" && discountBps > 0 ? (
                    <p className="mt-2 text-sm font-semibold text-emerald-700">
                      B2B {formatMoney(discountedPriceCents(line.unitPriceCents, discountBps), line.currency)}{" "}
                      each after {formatDiscountBps(discountBps)} tier
                    </p>
                  ) : null}
                </div>
              </article>
            ))}
          </div>

          <aside className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
            <h2 className="text-xl font-semibold text-zinc-950">Order summary</h2>
            <dl className="mt-5 grid gap-3 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-zinc-500">Subtotal</dt>
                <dd className="font-semibold text-zinc-950">
                  {formatMoney(quote.subtotalCents, quote.currency)}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-zinc-500">Shipping</dt>
                <dd className="font-semibold text-zinc-950">Calculated after launch</dd>
              </div>
              {selectedChannel === "b2b" ? (
                <>
                  <div className="flex justify-between gap-4">
                    <dt className="text-zinc-500">Wholesale minimum</dt>
                    <dd className="font-semibold text-zinc-950">
                      {formatMoney(wholesaleMinimum, quote.currency)}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-zinc-500">Wholesale discount</dt>
                    <dd className="font-semibold text-emerald-700">
                      -{formatMoney(discountCents, quote.currency)}
                    </dd>
                  </div>
                </>
              ) : null}
              <div className="flex justify-between gap-4">
                <dt className="text-zinc-500">GST included estimate</dt>
                <dd className="font-semibold text-zinc-950">{formatMoney(gst, quote.currency)}</dd>
              </div>
              {belowWholesaleMinimum ? (
                <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-900">
                  Add {formatMoney(wholesaleMinimum - quote.subtotalCents, quote.currency)} to
                  reach your wholesale minimum.
                </div>
              ) : null}
              <div className="mt-3 border-t border-zinc-200 pt-4">
                <div className="flex justify-between gap-4">
                  <dt className="text-base font-semibold text-zinc-950">Total due now</dt>
                  <dd className="text-xl font-bold text-zinc-950">
                    {formatMoney(totalDueCents, quote.currency)}
                  </dd>
                </div>
              </div>
            </dl>

            <CartCheckoutPanel
              channel={selectedChannel}
              disabled={Boolean(quoteError) || belowWholesaleMinimum}
              items={cartItems}
              publishableKey={process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? ""}
              startLabel={selectedChannel === "b2b" ? "Pay wholesale order" : "Pay securely"}
              supabaseAnonKey={process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ""}
              supabaseUrl={process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""}
            />
          </aside>
        </section>
      )}
    </div>
  );
}

async function currentWholesaleAccess(): Promise<WholesaleAccess | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  const customer = await getCustomerProfile(user.id);
  if (!customer) return null;

  try {
    return await getWholesaleAccess(createServiceClient(), customer.id);
  } catch (error) {
    console.error("cart wholesale pricing lookup failed:", safeError(error));
    return null;
  }
}

function channelLinkClass(active: boolean): string {
  return active
    ? "inline-flex min-h-10 items-center justify-center rounded-md bg-zinc-950 px-4 text-sm font-semibold text-white"
    : "inline-flex min-h-10 items-center justify-center rounded-md border border-zinc-300 px-4 text-sm font-semibold text-zinc-800 hover:border-zinc-500";
}

function safeError(error: unknown): string {
  return error instanceof Error ? error.message : "unknown";
}
