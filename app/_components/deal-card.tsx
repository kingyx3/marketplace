import Image from "next/image";
import Link from "next/link";

import { StatusBadge } from "@/app/_components/status-badge";
import { formatDealDiscount, type LimitedTimeDeal } from "@/lib/deals";
import { formatMoney } from "@/lib/money";

export function DealCard({ deal }: { deal: LimitedTimeDeal }) {
  return (
    <article className="group grid overflow-hidden rounded-xl border border-emerald-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <Link href={`/products/${deal.productSlug}`} className="block">
        <div className="relative aspect-[16/9] overflow-hidden bg-zinc-100">
          <Image
            alt={`${deal.productName} sealed product`}
            className="object-cover transition duration-300 group-hover:scale-[1.03]"
            fill
            sizes="(min-width: 1024px) 32vw, (min-width: 640px) 50vw, 100vw"
            src={deal.productImageUrl ?? "/images/sealed-tcg-hero.png"}
          />
          <div className="absolute left-3 top-3 flex flex-wrap gap-2">
            <StatusBadge tone="success">Save {formatDealDiscount(deal.discountBps)}</StatusBadge>
            {deal.visibility === "members" ? <StatusBadge tone="dark">Members</StatusBadge> : null}
          </div>
        </div>
      </Link>
      <div className="grid gap-4 p-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
            {deal.title}
          </p>
          <h3 className="mt-2 text-lg font-semibold text-zinc-950">
            <Link href={`/products/${deal.productSlug}`} className="hover:text-emerald-700">
              {deal.productName}
            </Link>
          </h3>
        </div>
        <div className="flex flex-wrap items-end gap-x-3 gap-y-1">
          <p className="text-2xl font-bold text-zinc-950">
            {formatMoney(deal.dealPriceCents, deal.currency)}
          </p>
          <p className="text-sm text-zinc-500 line-through">
            {formatMoney(deal.regularPriceCents, deal.currency)}
          </p>
        </div>
        <p className="text-xs text-zinc-500">Ends {formatDealExpiry(deal.endsAt)}</p>
        <Link
          className="inline-flex min-h-11 items-center justify-center rounded-md bg-zinc-950 px-4 text-sm font-semibold text-white hover:bg-emerald-700"
          href={`/products/${deal.productSlug}`}
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
