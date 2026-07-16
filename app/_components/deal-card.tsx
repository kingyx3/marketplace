import Image from "next/image";
import Link from "next/link";

import { StatusBadge } from "@/app/_components/status-badge";
import { formatDealDiscount, type LimitedTimeDeal } from "@/lib/deals";
import { formatMoney } from "@/lib/money";

export function DealCard({ deal }: { deal: LimitedTimeDeal }) {
  return (
    <article className="grid overflow-hidden rounded-lg border border-emerald-200 bg-white shadow-sm">
      <Link href={`/catalog/${deal.productSlug}`} className="group block">
        <div className="relative aspect-[16/9] overflow-hidden bg-zinc-100">
          <Image
            alt={`${deal.productName} sealed product`}
            className="object-cover transition duration-300 group-hover:scale-105"
            fill
            sizes="(min-width: 1024px) 32vw, (min-width: 640px) 50vw, 100vw"
            src={deal.productImageUrl ?? "/images/sealed-tcg-hero.png"}
          />
          <div className="absolute left-3 top-3 flex flex-wrap gap-2">
            <StatusBadge tone="success">Save {formatDealDiscount(deal.discountBps)}</StatusBadge>
            {deal.visibility === "members" ? (
              <StatusBadge tone="dark">Member deal</StatusBadge>
            ) : (
              <StatusBadge tone="neutral">Public preview</StatusBadge>
            )}
          </div>
        </div>
      </Link>
      <div className="grid gap-4 p-5">
        <div>
          <p className="text-xs font-semibold uppercase text-emerald-700">{deal.title}</p>
          <h2 className="mt-2 text-lg font-semibold text-zinc-950">
            <Link href={`/catalog/${deal.productSlug}`} className="hover:text-emerald-700">
              {deal.productName}
            </Link>
          </h2>
          {deal.description ? (
            <p className="mt-2 line-clamp-2 text-sm leading-6 text-zinc-600">{deal.description}</p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-end gap-x-3 gap-y-1">
          <p className="text-2xl font-bold text-zinc-950">
            {formatMoney(deal.dealPriceCents, deal.currency)}
          </p>
          <p className="text-sm text-zinc-500 line-through">
            {formatMoney(deal.regularPriceCents, deal.currency)}
          </p>
        </div>
        <p className="text-xs text-zinc-500">
          Ends {formatDealExpiry(deal.endsAt)}. Eligibility and final savings are revalidated at
          checkout.
        </p>
        <Link
          className="inline-flex min-h-11 items-center justify-center rounded-md bg-zinc-950 px-4 text-sm font-semibold text-white hover:bg-emerald-700"
          href={`/catalog/${deal.productSlug}`}
        >
          View product
        </Link>
      </div>
    </article>
  );
}

function formatDealExpiry(value: string): string {
  return new Intl.DateTimeFormat("en-SG", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Singapore",
  }).format(new Date(value));
}
