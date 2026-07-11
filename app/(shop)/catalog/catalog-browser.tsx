"use client";

import { type FormEvent, useMemo, useState } from "react";

import { ProductCard } from "@/app/_components/product-card";
import {
  formatStatus,
  type MarketplaceProduct,
} from "@/app/_data/marketplace-fixtures";
import type { WholesaleAccess } from "@/lib/b2b";

import {
  ALL_CATALOG_FILTERS,
  catalogGames,
  catalogStatuses,
  EMPTY_CATALOG_FILTERS,
  filterCatalogProducts,
  type CatalogFilters,
  type CatalogStatusFilter,
} from "./catalog-filters";

export function CatalogBrowser({
  products,
  sourceLabel,
  wholesaleAccess,
}: {
  products: MarketplaceProduct[];
  sourceLabel: string;
  wholesaleAccess: WholesaleAccess | null;
}) {
  const [draftFilters, setDraftFilters] = useState<CatalogFilters>(EMPTY_CATALOG_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<CatalogFilters>(EMPTY_CATALOG_FILTERS);
  const games = useMemo(() => catalogGames(products), [products]);
  const statuses = useMemo(() => catalogStatuses(products), [products]);
  const filteredProducts = useMemo(
    () => filterCatalogProducts(products, appliedFilters),
    [appliedFilters, products]
  );
  const hasAppliedFilters =
    appliedFilters.query !== "" ||
    appliedFilters.game !== ALL_CATALOG_FILTERS ||
    appliedFilters.status !== ALL_CATALOG_FILTERS;

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAppliedFilters({ ...draftFilters, query: draftFilters.query.trim() });
  }

  function clearFilters() {
    setDraftFilters({ ...EMPTY_CATALOG_FILTERS });
    setAppliedFilters({ ...EMPTY_CATALOG_FILTERS });
  }

  return (
    <div className="space-y-6">
      <form
        className="grid gap-3 rounded-lg border border-zinc-200 bg-white p-4 shadow-sm md:grid-cols-[1fr_12rem_12rem_auto]"
        onSubmit={applyFilters}
      >
        <label className="grid gap-2 text-sm font-medium text-zinc-700">
          Search
          <input
            className="min-h-11 rounded-md border border-zinc-300 px-3 text-sm outline-none focus:border-emerald-600"
            onChange={(event) =>
              setDraftFilters((current) => ({ ...current, query: event.target.value }))
            }
            placeholder="Set, game, SKU"
            type="search"
            value={draftFilters.query}
          />
        </label>
        <label className="grid gap-2 text-sm font-medium text-zinc-700">
          Game
          <select
            className="min-h-11 rounded-md border border-zinc-300 px-3 text-sm outline-none focus:border-emerald-600"
            onChange={(event) =>
              setDraftFilters((current) => ({ ...current, game: event.target.value }))
            }
            value={draftFilters.game}
          >
            <option value={ALL_CATALOG_FILTERS}>All games</option>
            {games.map((game) => (
              <option key={game} value={game}>
                {game}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-2 text-sm font-medium text-zinc-700">
          Status
          <select
            className="min-h-11 rounded-md border border-zinc-300 px-3 text-sm outline-none focus:border-emerald-600"
            onChange={(event) =>
              setDraftFilters((current) => ({
                ...current,
                status: event.target.value as CatalogStatusFilter,
              }))
            }
            value={draftFilters.status}
          >
            <option value={ALL_CATALOG_FILTERS}>All statuses</option>
            {statuses.map((status) => (
              <option key={status} value={status}>
                {formatStatus(status)}
              </option>
            ))}
          </select>
        </label>
        <div className="flex content-end items-end gap-2">
          <button
            className="min-h-11 flex-1 rounded-md bg-zinc-950 px-4 text-sm font-semibold text-white hover:bg-emerald-700"
            type="submit"
          >
            Apply
          </button>
          <button
            className="min-h-11 rounded-md border border-zinc-300 px-4 text-sm font-semibold text-zinc-700 hover:border-zinc-500 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!hasAppliedFilters}
            onClick={clearFilters}
            type="button"
          >
            Clear
          </button>
        </div>
      </form>

      <p aria-live="polite" className="text-sm text-zinc-600">
        Showing {filteredProducts.length} of {products.length} products
      </p>

      {filteredProducts.length === 0 ? (
        <section className="rounded-lg border border-zinc-200 bg-white p-8 text-center shadow-sm">
          <h2 className="text-xl font-semibold text-zinc-950">No products match these filters</h2>
          <p className="mt-3 text-sm text-zinc-600">
            Clear the filters or try a broader search term.
          </p>
          <button
            className="mt-6 inline-flex min-h-11 items-center justify-center rounded-md bg-zinc-950 px-5 text-sm font-semibold text-white hover:bg-emerald-700"
            onClick={clearFilters}
            type="button"
          >
            Clear filters
          </button>
        </section>
      ) : (
        <section aria-label="Catalog results" className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {filteredProducts.map((product) => (
            <ProductCard
              key={product.slug}
              product={product}
              sourceLabel={sourceLabel}
              wholesaleAccess={wholesaleAccess}
            />
          ))}
        </section>
      )}
    </div>
  );
}
