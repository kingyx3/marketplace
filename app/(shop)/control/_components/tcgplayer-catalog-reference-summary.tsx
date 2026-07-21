import type { TcgplayerCatalogSuggestion } from "@/lib/tcgplayer-catalog";
import { formatUsd } from "@/app/(shop)/control/_components/tcgplayer-catalog-import-helpers";

export function CatalogReferenceSummary({
  suggestion,
}: {
  suggestion: TcgplayerCatalogSuggestion;
}) {
  const primaryPrice = suggestion.prices.find(
    (price) => price.marketPrice !== null,
  );
  return (
    <div className="grid gap-4 rounded-lg border border-indigo-200 bg-white p-4 lg:grid-cols-[1fr_1fr]">
      <div className="grid content-start gap-2 text-sm text-zinc-700">
        <p className="font-semibold text-zinc-950">External reference</p>
        <p>
          <span className="font-medium">TCGplayer product:</span>{" "}
          {suggestion.productId}
        </p>
        <p>
          <span className="font-medium">Category:</span>{" "}
          {suggestion.category.name ?? "Not supplied"}
        </p>
        <p>
          <span className="font-medium">Set:</span>{" "}
          {suggestion.set.name ?? "Not supplied"}
          {suggestion.set.code ? ` (${suggestion.set.code})` : ""}
        </p>
        <p>
          <span className="font-medium">Product type:</span>{" "}
          {suggestion.product.productType ?? "Not supplied"}
        </p>
        {suggestion.product.upc ? (
          <p>
            <span className="font-medium">UPC/barcode reference:</span>{" "}
            {suggestion.product.upc}
          </p>
        ) : null}
        <p>
          <span className="font-medium">Market-price reference:</span>{" "}
          {primaryPrice?.marketPrice !== null &&
          primaryPrice?.marketPrice !== undefined
            ? formatUsd(primaryPrice.marketPrice)
            : "Unavailable"}
        </p>
        <a
          className="font-semibold text-indigo-700 underline underline-offset-2"
          href={suggestion.sourceUrl}
          rel="noreferrer"
          target="_blank"
        >
          Open source product on TCGplayer
        </a>
      </div>

      <div className="grid content-start gap-2 text-sm text-zinc-700">
        <p className="font-semibold text-zinc-950">Import coverage</p>
        <p>
          {suggestion.skus.length} SKU variant
          {suggestion.skus.length === 1 ? "" : "s"} returned.
        </p>
        <p>
          Packaging:{" "}
          {[
            suggestion.product.packsPerBox
              ? `${suggestion.product.packsPerBox} packs/box`
              : null,
            suggestion.product.cardsPerPack
              ? `${suggestion.product.cardsPerPack} cards/pack`
              : null,
            suggestion.product.weightGrams
              ? `${suggestion.product.weightGrams} g`
              : null,
          ]
            .filter(Boolean)
            .join(" · ") || "Not supplied"}
        </p>
        {suggestion.warnings.length > 0 ? (
          <ul className="grid gap-1 text-xs text-amber-800">
            {suggestion.warnings.map((warning) => (
              <li key={warning}>• {warning}</li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
