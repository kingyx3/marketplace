import Image from "next/image";
import Link from "next/link";

import { StatusBadge } from "@/app/_components/status-badge";
import {
  formatMoney,
  formatStatus,
  getAvailable,
  type MarketplaceProduct,
} from "@/app/_data/marketplace-fixtures";

function getStatusTone(status: MarketplaceProduct["setStatus"]) {
  if (status === "preorder_open") return "success";
  if (status === "announced") return "info";
  if (status === "released") return "dark";
  if (status === "preorder_closed") return "warning";
  return "neutral";
}

export function ProductCard({ product }: { product: MarketplaceProduct }) {
  const available = getAvailable(product);

  return (
    <article className="group grid overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <Link href={`/catalog/${product.slug}`} className="block">
        <div className="relative aspect-[4/3] overflow-hidden bg-zinc-100">
          <Image
            src={product.image}
            alt={`${product.name} sealed product display`}
            fill
            className="object-cover transition duration-300 group-hover:scale-[1.03]"
            sizes="(min-width: 1024px) 32vw, (min-width: 640px) 50vw, 100vw"
          />
          <div className="absolute left-3 top-3">
            <StatusBadge tone={getStatusTone(product.setStatus)}>
              {formatStatus(product.setStatus)}
            </StatusBadge>
          </div>
        </div>
      </Link>

      <div className="grid gap-4 p-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            {product.game} · {product.setCode}
          </p>
          <h2 className="mt-2 text-lg font-semibold leading-tight text-zinc-950">
            <Link href={`/catalog/${product.slug}`} className="hover:text-emerald-700">
              {product.name}
            </Link>
          </h2>
        </div>

        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-xl font-bold text-zinc-950">
              {formatMoney(product.priceCents, product.currency)}
            </p>
            <p className="mt-1 text-xs text-zinc-500">GST included where applicable</p>
          </div>
          <p className="text-right text-sm text-zinc-600">
            <span className="block font-semibold text-zinc-950">{available}</span>
            available
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {product.tags.slice(0, 3).map((tag) => (
            <span key={tag} className="rounded-full bg-zinc-100 px-3 py-1 text-xs text-zinc-600">
              {tag}
            </span>
          ))}
        </div>

        <Link
          href={`/catalog/${product.slug}`}
          className="inline-flex min-h-11 items-center justify-center rounded-md bg-zinc-950 px-4 text-sm font-semibold text-white hover:bg-emerald-700"
        >
          View product
        </Link>
      </div>
    </article>
  );
}
