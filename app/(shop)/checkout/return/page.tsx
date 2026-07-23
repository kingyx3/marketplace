import type { Metadata } from "next";
import Link from "next/link";

import { CheckoutStatus } from "@/app/(shop)/checkout/return/checkout-status";
import { checkoutReturnDestination } from "@/lib/checkout-return";

export const metadata: Metadata = {
  title: "Checkout return",
  robots: { index: false, follow: false },
};

export default async function CheckoutReturnPage({
  searchParams,
}: {
  searchParams?: Promise<{
    status?: string;
    order?: string;
    destination?: string;
  }>;
}) {
  const params = (await searchParams) ?? {};
  const destination = checkoutReturnDestination(
    params.order,
    params.destination,
  );

  return (
    <div className="space-y-6 sm:space-y-8">
      <CheckoutStatus orderId={params.order} providerStatus={params.status} />

      <section className="max-w-2xl rounded-xl border border-zinc-200 bg-white p-6 shadow-sm sm:p-8">
        <h2 className="text-lg font-semibold text-zinc-950">
          What happens next
        </h2>
        <p className="mt-2 text-sm leading-6 text-zinc-600">
          Your order page will show the latest payment and fulfilment status.
          Confirmation may take a short moment after you return from checkout.
        </p>
        <div className="mt-7 grid gap-3 sm:flex sm:flex-wrap">
          <Link
            className="inline-flex min-h-11 items-center justify-center rounded-md bg-zinc-950 px-5 text-sm font-semibold text-white hover:bg-emerald-700"
            href={destination.href}
          >
            {destination.label}
          </Link>
          <Link
            className="inline-flex min-h-11 items-center justify-center rounded-md border border-zinc-300 px-5 text-sm font-semibold text-zinc-800 hover:border-zinc-500"
            href="/products"
          >
            Continue shopping
          </Link>
        </div>
      </section>
    </div>
  );
}
