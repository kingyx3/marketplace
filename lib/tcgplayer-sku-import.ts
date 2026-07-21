import type {
  TcgplayerCatalogSuggestion,
  TcgplayerSkuReference,
} from "@/lib/tcgplayer-catalog";

export type TcgplayerSkuImportDraft = {
  sourceSkuId: number | null;
  sourceProductConditionId: number | null;
  sourceConditionId: number | null;
  sourceLanguageId: number | null;
  sourcePrintingId: number | null;
  sourceVariantId: number | null;
  condition: string | null;
  language: string | null;
  printing: string | null;
  marketPriceUsd: number | null;
  lowPriceUsd: number | null;
  midPriceUsd: number | null;
  highPriceUsd: number | null;
  directLowPriceUsd: number | null;
  sku: string;
  barcode: string | null;
  packsPerBox: number | null;
  cardsPerPack: number | null;
  weightGrams: number | null;
  active: boolean;
};

export function buildTcgplayerSkuImportDrafts(
  suggestion: TcgplayerCatalogSuggestion,
): TcgplayerSkuImportDraft[] {
  return suggestion.skus.map((source, index) => ({
    sourceSkuId: source.skuId,
    sourceProductConditionId: source.productConditionId,
    sourceConditionId: source.conditionId,
    sourceLanguageId: source.languageId,
    sourcePrintingId: source.printingId,
    sourceVariantId: source.variantId,
    condition: source.condition,
    language: source.language,
    printing: source.printing,
    marketPriceUsd: source.marketPrice,
    lowPriceUsd: source.lowPrice,
    midPriceUsd: source.midPrice,
    highPriceUsd: source.highPrice,
    directLowPriceUsd: source.directLowPrice,
    sku: localSkuCode(suggestion.productId, source, index),
    barcode:
      source.barcode ??
      (suggestion.skus.length === 1 ? suggestion.product.upc : null),
    packsPerBox: source.packsPerBox ?? suggestion.product.packsPerBox,
    cardsPerPack: source.cardsPerPack ?? suggestion.product.cardsPerPack,
    weightGrams: source.weightGrams ?? suggestion.product.weightGrams,
    active: true,
  }));
}

function localSkuCode(
  productId: number,
  source: TcgplayerSkuReference,
  index: number,
): string {
  const sourceId = source.skuId ?? index + 1;
  return `TCG-${productId}-${sourceId}`.slice(0, 64).toUpperCase();
}
