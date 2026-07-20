import Link from "next/link";

import { CartCheckoutPanel } from "@/app/(shop)/cart/checkout-panel";
import { PageHeader } from "@/app/_components/page-header";
import { StatusBadge } from "@/app/_components/status-badge";
import { removeFromCart, updateCartQuantity } from "@/app/actions/cart";
import { getCurrentUser } from "@/lib/auth";
import { readCart } from "@/lib/cart";
import { getSkuQuote } from "@/lib/catalog";
import {
  calculateDealSavings,
  discountedDealPrice,
  formatDealDiscount,
  getActiveDealDiscounts,
} from "@/lib/deals";
import { formatMoney } from "@/lib/money";
import { createAnonClient, createUserClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function CartPage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string; checkout?: string; order?: string }>;
}) {
  const params = (await searchParams) ?? {};
  const cartItems = await readCart();
  const user = await getCurrentUser();
  let quote;
  let quoteError: string | null = null;

  try {
    quote = await getSkuQuote(cartItems);
  } catch (error) {
    quote = { lines: [], subtotalCents: 0, currency: "SGD" };
    quoteError = error instanceof Error ? error.message : "Unable to quote cart";
  }

  const dealDiscounts = await currentDealDiscounts(
    Boolean(user),
    quote.lines.map((line) => line.skuId)
  );
  const discountCents = quote.lines.reduce(
    (total, line) =>
      total + calculateDealSavings(line.lineTotalCents, dealDiscounts.get(line.skuId) ?? 0),
    0
  );
  const merchandiseTotalCents = quote.subtotalCents - discountCents;
  const gst = Math.round((merchandiseTotalCents * 9) / 109);
  const hasAvailabilityIssue = quote.lines.some((line) => line.available < line.quantity);

  return (
    <div className="space-y-6 sm:space-y-8">
      <PageHeader eyebrow="Cart" title="Review your order" />

      {params.error ? (
        <div className="rounded-md border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          Checkout could not continue: {params.error}
        </div>
      ) : null}
      {params.checkout === "cancelled" ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Payment was cancelled. Your cart is unchanged.
        </div>
      ) : null}
      {params.checkout === "processing" ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          HitPay has returned you to the store. Payment status will update from the signed webhook.
          {params.order ? (
            <>
              {" "}
              <Link className="font-semibold underline" href={`/orders/${params.order}`}>
                View order
              </Link>
              .
            </>
          ) : null}
        </div>
      ) : null}
      {params.checkout === "failed" ? (
        <div className="rounded-md border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          Payment was not completed. Try again when ready.
        </div>
      ) : null}
      {quoteError ? (
        <div className="rounded-md border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          {quoteError}
        </div>
      ) : null}
      {hasAvailabilityIssue ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          One or more items are sold out or exceed current stock. Remove them or reduce the quantity
          before checkout.
        </div>
      ) : null}

      {quote.lines.length === 0 ? (
        <section className="rounded-lg border border-zinc-200 bg-white p-6 text-center shadow-sm sm:p-8">
          <h2 className="text-xl font-semibold text-zinc-950">Your cart is empty</h2>
          <p className="mt-2 text-sm text-zinc-600">Add a product to begin checkout.</p>
          <Link
            href="/products"
            className="mt-6 inline-flex min-h-11 w-full items-center justify-center rounded-md bg-zinc-950 px-5 text-sm font-semibold text-white hover:bg-emerald-700 sm:w-auto"
          >
            Browse products
          </Link>
        </section>
      ) : (
        <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
          <div className="min-w-0 space-y-4">
            {quote.lines.map((line) => {
              const lineDealDiscountBps = dealDiscounts.get(line.skuId) ?? 0;
              const outOfStock = line.available <= 0;
              const shortStock = !outOfStock && line.available < line.quantity;
              const lowStock = !shortStock && line.available <= 5;
              const availabilityLabel = outOfStock
                ? "Out of stock"
                : shortStock
                  ? `Only ${line.available} available`
                  : lowStock
                    ? `Only ${line.available} left`
                    : "In stock";
              const availabilityTone = outOfStock
                ? "danger"
                : shortStock || lowStock
                  ? "warning"
                  : "success";

              return (
                <article
                  key={line.skuId}
                  className={`grid min-w-0 gap-4 rounded-lg border bg-white p-4 shadow-sm sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:p-5 ${
                    outOfStock || shortStock ? "border-amber-300" : "border-zinc-200"
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="min-w-0 break-words text-lg font-semibold text-zinc-950">
                        {line.name}
                      </h2>
                      <StatusBadge tone={availabilityTone}>{availabilityLabel}</StatusBadge>
                    </div>
                    {outOfStock ? (
                      <p className="mt-3 text-sm font-medium text-amber-800">
                        Remove this item to continue checkout. It will remain in your cart until you
                        decide.
                      </p>
                    ) : shortStock ? (
                      <p className="mt-3 text-sm font-medium text-amber-800">
                        Reduce the quantity to {line.available} or fewer to continue checkout.
                      </p>
                    ) : null}
                    <div className="mt-4 grid gap-2 sm:flex sm:flex-wrap">
                      <form
                        action={updateCartQuantity}
                        className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-end gap-2 sm:flex sm:w-auto"
                      >
                        <input type="hidden" name="skuId" value={line.skuId} />
                        <label className="grid min-w-0 gap-1 text-sm font-medium text-zinc-700">
                          Quantity
                          <input
                            className="min-h-11 w-full min-w-0 rounded-md border border-zinc-300 px-3 text-sm disabled:cursor-not-allowed disabled:bg-zinc-100 sm:w-24"
                            defaultValue={line.quantity}
                            disabled={outOfStock}
                            min={1}
                            max={Math.min(24, line.available)}
                            name="quantity"
                            type="number"
                          />
                        </label>
                        <button
                          className="min-h-11 rounded-md border border-zinc-300 px-3 text-sm font-semibold text-zinc-800 hover:border-zinc-500 disabled:cursor-not-allowed disabled:text-zinc-400 sm:px-4"
                          disabled={outOfStock}
                        >
                          Update
                        </button>
                      </form>
                      <form action={removeFromCart} className="grid w-full content-end sm:w-auto">
                        <input type="hidden" name="skuId" value={line.skuId} />
                        <button className="min-h-11 w-full rounded-md border border-rose-200 px-4 text-sm font-semibold text-rose-700 hover:border-rose-400">
                          Remove
                        </button>
                      </form>
                    </div>
                  </div>
                  <div className="min-w-0 text-left sm:text-right">
                    <p className="text-xl font-bold text-zinc-950">
                      {formatMoney(line.lineTotalCents, line.currency)}
                    </p>
                    <p className="mt-1 text-sm text-zinc-500">
                      {formatMoney(line.unitPriceCents, line.currency)} each
                    </p>
                    {lineDealDiscountBps > 0 ? (
                      <p className="mt-2 break-words text-sm font-semibold text-emerald-700">
                        Deal{" "}
                        {formatMoney(
                          discountedDealPrice(line.unitPriceCents, lineDealDiscountBps),
                          line.currency
                        )}{" "}
                        each ({formatDealDiscount(lineDealDiscountBps)} off)
                      </p>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>

          <aside className="h-fit min-w-0 rounded-lg border border-zinc-200 bg-white p-4 shadow-sm sm:p-5 lg:sticky lg:top-28">
            <h2 className="text-xl font-semibold text-zinc-950">Order summary</h2>
            <dl className="mt-5 grid gap-3 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-zinc-500">Subtotal</dt>
                <dd className="font-semibold text-zinc-950">
                  {formatMoney(quote.subtotalCents, quote.currency)}
                </dd>
              </div>
              {discountCents > 0 ? (
                <div className="flex justify-between gap-4">
                  <dt className="text-zinc-500">Deals</dt>
                  <dd className="font-semibold text-emerald-700">
                    -{formatMoney(discountCents, quote.currency)}
                  </dd>
                </div>
              ) : null}
              <div className="flex justify-between gap-4">
                <dt className="text-zinc-500">Shipping</dt>
                <dd className="text-right font-semibold text-zinc-950">Calculated at payment</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-zinc-500">GST included</dt>
                <dd className="font-semibold text-zinc-950">{formatMoney(gst, quote.currency)}</dd>
              </div>
              <div className="mt-3 border-t border-zinc-200 pt-4">
                <div className="flex justify-between gap-4">
                  <dt className="text-base font-semibold text-zinc-950">Items total</dt>
                  <dd className="text-xl font-bold text-zinc-950">
                    {formatMoney(merchandiseTotalCents, quote.currency)}
                  </dd>
                </div>
              </div>
            </dl>

            {hasAvailabilityIssue ? (
              <p className="mt-5 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
                Checkout is disabled until unavailable quantities are corrected.
              </p>
            ) : null}

            <CartCheckoutPanel
              disabled={Boolean(quoteError) || hasAvailabilityIssue}
              items={cartItems}
              supabaseAnonKey={process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? ""}
              supabaseUrl={process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""}
            />
          </aside>
        </section>
      )}
    </div>
  );
}

async function currentDealDiscounts(
  signedIn: boolean,
  skuIds: string[]
): Promise<Map<string, number>> {
  if (skuIds.length === 0) return new Map();
  try {
    const supabase = signedIn ? await createUserClient() : createAnonClient();
    return await getActiveDealDiscounts(supabase, skuIds);
  } catch (error) {
    console.error("cart deal lookup failed:", safeError(error));
    return new Map();
  }
}

function safeError(error: unknown): string {
  return error instanceof Error ? error.message : "unknown";
}
