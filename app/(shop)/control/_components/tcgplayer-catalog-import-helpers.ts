import type {
  CatalogCategoryOption,
  CatalogProductTypeOption,
  CatalogSetOption,
} from "@/app/(shop)/control/_components/product-intake-form";
import { ApiClientError } from "@/lib/api/client";
import type { TcgplayerCatalogSuggestion } from "@/lib/tcgplayer-catalog";
import {
  buildTcgplayerProductImportDrafts,
  type TcgplayerProductImportDraft,
} from "@/lib/tcgplayer-product-import";

const NEW_VALUE = "__new__";

type SuggestionSetters = {
  setSuggestion: (value: TcgplayerCatalogSuggestion) => void;
  setProductDrafts: (value: TcgplayerProductImportDraft[]) => void;
  setName: (value: string) => void;
  setDescription: (value: string) => void;
  setImageUrl: (value: string) => void;
  setLanguage: (value: string) => void;
  setCategoryChoice: (value: string) => void;
  setNewCategoryName: (value: string) => void;
  setNewCategoryPublisher: (value: string) => void;
  setSetChoice: (value: string) => void;
  setNewSetName: (value: string) => void;
  setProductTypeChoice: (value: string) => void;
  setNewProductTypeName: (value: string) => void;
};

export function applySuggestion(
  suggestion: TcgplayerCatalogSuggestion,
  categories: CatalogCategoryOption[],
  sets: CatalogSetOption[],
  productTypes: CatalogProductTypeOption[],
  setters: SuggestionSetters,
) {
  const category = findNameMatch(
    categories,
    suggestion.category.name,
    (value) => value.name,
  );
  const categorySets = category
    ? sets.filter((set) => set.categoryId === category.id)
    : [];
  const set = findNameMatch(
    categorySets,
    suggestion.set.name,
    (value) => value.name,
  );
  const productType = findProductType(productTypes, suggestion);

  setters.setSuggestion(suggestion);
  setters.setProductDrafts(buildTcgplayerProductImportDrafts(suggestion));
  setters.setName(
    cleanExternalText(suggestion.product.cleanName ?? suggestion.product.name),
  );
  setters.setDescription(
    cleanExternalText(suggestion.product.description ?? "").slice(0, 2000),
  );
  setters.setImageUrl(suggestion.product.imageUrl ?? "");
  setters.setLanguage(suggestLanguage(suggestion));
  setters.setCategoryChoice(category?.id ?? NEW_VALUE);
  setters.setNewCategoryName(cleanExternalText(suggestion.category.name ?? ""));
  setters.setNewCategoryPublisher(
    cleanExternalText(suggestion.category.publisher ?? ""),
  );
  setters.setSetChoice(set?.id ?? NEW_VALUE);
  setters.setNewSetName(cleanExternalText(suggestion.set.name ?? ""));
  setters.setProductTypeChoice(productType?.code ?? NEW_VALUE);
  setters.setNewProductTypeName(suggestProductTypeName(suggestion));
}

function findProductType(
  productTypes: CatalogProductTypeOption[],
  suggestion: TcgplayerCatalogSuggestion,
): CatalogProductTypeOption | undefined {
  const externalType = suggestion.product.productType;
  const exact = findNameMatch(productTypes, externalType, (type) => type.name);
  if (exact) return exact;

  const haystack = normalizeName(
    `${suggestion.product.name} ${externalType ?? ""}`,
  );
  const aliases: Array<[string[], string[]]> = [
    [
      ["booster", "box"],
      ["booster", "box"],
    ],
    [
      ["elite", "trainer", "box"],
      ["elite", "trainer"],
    ],
    [
      ["booster", "pack"],
      ["booster", "pack"],
    ],
    [
      ["collector", "booster"],
      ["collector", "booster"],
    ],
    [
      ["starter", "deck"],
      ["starter", "deck"],
    ],
    [
      ["theme", "deck"],
      ["theme", "deck"],
    ],
    [["collection"], ["collection"]],
    [["bundle"], ["bundle"]],
    [["tin"], ["tin"]],
  ];

  for (const [sourceWords, targetWords] of aliases) {
    if (!sourceWords.every((word) => haystack.includes(word))) continue;
    const match = productTypes.find((type) => {
      const normalized = normalizeName(`${type.name} ${type.code}`);
      return targetWords.every((word) => normalized.includes(word));
    });
    if (match) return match;
  }

  return undefined;
}

export function findNameMatch<T>(
  values: T[],
  candidate: string | null,
  getName: (value: T) => string,
): T | undefined {
  const normalizedCandidate = normalizeName(candidate ?? "");
  if (!normalizedCandidate) return undefined;
  return values.find(
    (value) => normalizeName(getName(value)) === normalizedCandidate,
  );
}

function suggestProductTypeName(
  suggestion: TcgplayerCatalogSuggestion,
): string {
  if (suggestion.product.productType) {
    return cleanExternalText(suggestion.product.productType).slice(0, 160);
  }
  const name = normalizeName(suggestion.product.name);
  if (name.includes("booster box")) return "Booster box";
  if (name.includes("elite trainer box")) return "Elite trainer box";
  if (name.includes("booster pack")) return "Booster pack";
  if (name.includes("deck")) return "Deck";
  if (name.includes("collection")) return "Collection";
  if (name.includes("tin")) return "Tin";
  return "Sealed product";
}

function suggestLanguage(suggestion: TcgplayerCatalogSuggestion): string {
  const source =
    suggestion.product.language ??
    suggestion.variants.find((variant) => variant.language)?.language;
  if (!source) return "EN";
  const codeByName: Record<string, string> = {
    english: "EN",
    japanese: "JP",
    korean: "KO",
    chinese: "ZH",
    french: "FR",
    german: "DE",
    italian: "IT",
    spanish: "ES",
    portuguese: "PT",
  };
  const normalized = normalizeName(source);
  return (
    codeByName[normalized] ??
    (source
      .replace(/[^A-Za-z]/g, "")
      .slice(0, 8)
      .toUpperCase() ||
      "EN")
  );
}

function cleanExternalText(value: string): string {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeName(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function positiveIntegerOrNull(value: string): number | null {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

export function numberValue(value: number | null): string {
  return value === null ? "" : String(value);
}

export function emptyToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

export function formatUsd(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    return error.requestId
      ? `${error.message} Error reference: ${error.requestId}`
      : error.message;
  }
  return error instanceof Error
    ? error.message
    : "TCGplayer lookup failed. Please try again.";
}
