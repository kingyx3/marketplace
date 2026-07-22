import type {
  TcgplayerCatalogSuggestion,
  TcgplayerVariantReference,
} from "@/lib/tcgplayer-catalog";

export type TcgplayerProductImportDraft = {
  sourceVariantId: number | null;
  sourceProductConditionId: number | null;
  sourceConditionId: number | null;
  sourceLanguageId: number | null;
  sourcePrintingId: number | null;
  sourceProviderVariantId: number | null;
  condition: string | null;
  language: string | null;
  printing: string | null;
  marketPriceUsd: number | null;
  lowPriceUsd: number | null;
  midPriceUsd: number | null;
  highPriceUsd: number | null;
  directLowPriceUsd: number | null;
  name: string;
  referenceCode: string;
  barcode: string | null;
  packsPerBox: number | null;
  cardsPerPack: number | null;
  weightGrams: number | null;
  active: boolean;
};

export function buildTcgplayerProductImportDrafts(
  suggestion: TcgplayerCatalogSuggestion,
): TcgplayerProductImportDraft[] {
  const variants = suggestion.variants.length > 0 ? suggestion.variants : [null];
  return variants.map((source, index) => ({
    sourceVariantId: source?.providerVariantId ?? null,
    sourceProductConditionId: source?.productConditionId ?? null,
    sourceConditionId: source?.conditionId ?? null,
    sourceLanguageId: source?.languageId ?? null,
    sourcePrintingId: source?.printingId ?? null,
    sourceProviderVariantId: source?.variantId ?? null,
    condition: source?.condition ?? null,
    language: source?.language ?? suggestion.product.language,
    printing: source?.printing ?? null,
    marketPriceUsd: source?.marketPrice ?? null,
    lowPriceUsd: source?.lowPrice ?? null,
    midPriceUsd: source?.midPrice ?? null,
    highPriceUsd: source?.highPrice ?? null,
    directLowPriceUsd: source?.directLowPrice ?? null,
    name: localProductName(suggestion, source, variants.length),
    referenceCode: localProductReference(suggestion.productId, source, index),
    barcode:
      source?.barcode ??
      (variants.length === 1 ? suggestion.product.upc : null),
    packsPerBox: source?.packsPerBox ?? suggestion.product.packsPerBox,
    cardsPerPack: source?.cardsPerPack ?? suggestion.product.cardsPerPack,
    weightGrams: source?.weightGrams ?? suggestion.product.weightGrams,
    active: true,
  }));
}

function localProductName(
  suggestion: TcgplayerCatalogSuggestion,
  source: TcgplayerVariantReference | null,
  variantCount: number,
): string {
  const base = suggestion.product.cleanName ?? suggestion.product.name;
  if (!source || variantCount === 1) return base.slice(0, 160);
  const qualifiers = [source.language, source.condition, source.printing]
    .filter((value): value is string => Boolean(value?.trim()))
    .filter((value, index, values) => values.indexOf(value) === index);
  const suffix = qualifiers.length > 0 ? qualifiers.join(" · ") : `Variant ${source.providerVariantId ?? ""}`;
  return `${base} — ${suffix}`.slice(0, 160);
}

function localProductReference(
  productId: number,
  source: TcgplayerVariantReference | null,
  index: number,
): string {
  const sourceId = source?.providerVariantId ?? index + 1;
  return `TCG-${productId}-${sourceId}`.slice(0, 64).toUpperCase();
}

