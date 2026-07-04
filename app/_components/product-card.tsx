import Image from "next/image";
import Link from "next/link";
import {
  formatMoney,
  formatStatus,
  getAvailable,
  type MarketplaceProduct,
} from "@/app/_data/marketplace-fixtures";
import { StatusBadge } from "@/app/_components/status-badge";

function getStatusTone(status: MarketplaceProduct["setStatus"]) {
  if (status === "preorder_open") return "success";
  if (status === "announced") return "info";
  if (status === "released") return "dark";
  if (status === "preorder_closed") return "warning";
  return "neutral";
}

export function ProductCard({ product, sourceLabel }: { product: MarketplaceProduct; sourceLabel?: string }) {
  const available = getAvailable(product);

  return (
    <article className="grid overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm">
      <Link href={`/catalog/${product.slug}`} className="group block">
        <div className="relative aspect-[4/3] overflow-hidden bg-zinc-100">
          <Image
            src={product.image}
            alt={`${product.name} sealed product display`}
            fill
            className="object-cover transition duration-300 group-hover:scale-105"
            sizes="(min-width: 1024px) 32vw, (min-width: 640px) 50vw, 100vw"
          />
          <div className="absolute left-3 top-3 flex flex-wrap gap-2">
            <StatusBadge tone={getStatusTone(product.setStatus)}>{formatStatus(product.setStatus)}</StatusBadge>
            {sourceLabel ? <StatusBadge tone="neutral">{sourceLabel}</StatusBadge> : null}
          </div>
        </div>
      </Link>

      <div className="grid gap-4 p-4">
        <div>
          <p className="text-xs font-semibold uppercase text-zinc-500">{product.game} / {product.setCode}</p>
          <h2 className="mt-2 text-lg font-semibold leading-tight text-zinc-950">
            <Link href={`/catalog/${product.slug}`} className="hover:text-emerald-700">
              {product.name}
            </Link>
          </h2>
        </div>

        <p className="line-clamp-2 text-sm leading-6 text-zinc-600">{product.description}</p>

        <div className="grid grid-cols-3 gap-2 text-sm">
          <div className="rounded-md bg-zinc-50 p-3">
            <p className="font-semibold text-zinc-950">{formatMoney(product.priceCents, product.currency)}</p>
            <p className="mt-1 text-xs text-zinc-500">List price</p>
          </div>
          <div className="rounded-md bg-zinc-50 p-3">
            <p className="font-semibold text-zinc-950">{available}</p>
            <p className="mt-1 text-xs text-zinc-500">Available</p>
          </div>
          <div className="rounded-md bg-zinc-50 p-3">
            <p className="font-semibold text-zinc-950">{product.maxPerCustomer ?? "None"}</p>
            <p className="mt-1 text-xs text-zinc-500">Limit</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {product.tags.map((tag) => (
            <span key={tag} className="rounded-full bg-zinc-100 px-3 py-1 text-xs text-zinc-600">
              {tag}
            </span>
          ))}
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <Link
            href={`/catalog/${product.slug}`}
            className="inline-flex min-h-11 items-center justify-center rounded-md border border-zinc-300 px-4 text-sm font-semibold text-zinc-800 hover:border-zinc-500"
          >
            View product
          </Link>
          <Link
            href={`/catalog/${product.slug}`}
            className="inline-flex min-h-11 items-center justify-center rounded-md bg-zinc-950 px-4 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            Choose options
          </Link>
        </div>
      </div>
    </article>
  );
}
