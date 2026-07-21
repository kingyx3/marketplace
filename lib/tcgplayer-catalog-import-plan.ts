import type {
  CatalogCategoryOption,
  CatalogProductTypeOption,
  CatalogSetOption,
} from "@/app/(shop)/control/_components/product-intake-form";
import type { TcgplayerCatalogSuggestion } from "@/lib/tcgplayer-catalog";
import {
  buildTcgplayerSkuImportDrafts,
  type TcgplayerSkuImportDraft,
} from "@/lib/tcgplayer-sku-import";

export type TcgplayerCatalogImportPlan = {
  product: {
    name: string;
    description: string | null;
    imageUrl: string | null;
    language: string;
  };
  category: {
    id: string | null;
    name: string;
    publisher: string | null;
  };
  set: {
    id: string | null;
    name: string;
    releaseDate: string | null;
  };
  productType: {
    code: string | null;
    name: string;
  };
  skus: TcgplayerSkuImportDraft[];
  warnings: string[];
};

export function buildTcgplayerCatalogImportPlan(
  suggestion: TcgplayerCatalogSuggestion,
  categories: CatalogCategoryOption[],
  sets: CatalogSetOption[],
  productTypes: CatalogProductTypeOption[],
): TcgplayerCatalogImportPlan {
  const fallbackWarnings: string[] = [];
  const categoryName = boundedName(
    suggestion.category.name,
    "TCGplayer",
    fallbackWarnings,
    "TCGplayer did not return a category, so the import used the TCGplayer category.",
  );
  const category = findNameMatch(categories, categoryName, (value) => value.name);
  const setName = boundedName(
    suggestion.set.name,
    `TCGplayer product ${suggestion.productId}`,
    fallbackWarnings,
    "TCGplayer did not return a set, so the import created a product-specific set.",
  );
  const categorySets = category
    ? sets.filter((set) => set.categoryId === category.id)
    : [];
  const set = findNameMatch(categorySets, setName, (value) => value.name);
  const productTypeName = suggestProductTypeName(suggestion);
  const productType = findProductType(productTypes, suggestion, productTypeName);
  const productName = boundedName(
    suggestion.product.cleanName ?? suggestion.product.name,
    `TCGplayer product ${suggestion.productId}`,
    fallbackWarnings,
    "TCGplayer did not return a usable product name, so the import used its product ID.",
  );

  return {
    product: {
      name: productName,
      description: nullableText(suggestion.product.description, 2000),
      imageUrl: suggestion.product.imageUrl,
      language: suggestLanguage(suggestion),
    },
    category: {
      id: category?.id ?? null,
      name: categoryName,
      publisher: nullableText(suggestion.category.publisher, 160),
    },
    set: {
      id: set?.id ?? null,
      name: setName,
      releaseDate: exactIsoDateOrNull(suggestion.set.releaseDate),
    },
    productType: {
      code: productType?.code ?? null,
      name: productTypeName,
    },
    skus: buildTcgplayerSkuImportDrafts(suggestion),
    warnings: uniqueStrings([...suggestion.warnings, ...fallbackWarnings]),
  };
}

function findProductType(
  productTypes: CatalogProductTypeOption[],
  suggestion: TcgplayerCatalogSuggestion,
  suggestedName: string,
): CatalogProductTypeOption | undefined {
  const exact = findNameMatch(
    productTypes,
    suggestion.product.productType ?? suggestedName,
    (type) => type.name,
  );
  if (exact) return exact;

  const haystack = normalizeName(
    `${suggestion.product.name} ${suggestion.product.productType ?? ""}`,
  );
  const aliases: Array<[string[], string[]]> = [
    [["booster", "box"], ["booster", "box"]],
    [["elite", "trainer", "box"], ["elite", "trainer"]],
    [["booster", "pack"], ["booster", "pack"]],
    [["collector", "booster"], ["collector", "booster"]],
    [["starter", "deck"], ["starter", "deck"]],
    [["theme", "deck"], ["theme", "deck"]],
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

function findNameMatch<T>(
  values: T[],
  candidate: string,
  getName: (value: T) => string,
): T | undefined {
  const normalizedCandidate = normalizeName(candidate);
  if (!normalizedCandidate) return undefined;
  return values.find(
    (value) => normalizeName(getName(value)) === normalizedCandidate,
  );
}

function suggestProductTypeName(
  suggestion: TcgplayerCatalogSuggestion,
): string {
  const externalType = nullableText(suggestion.product.productType, 160);
  if (externalType && externalType.length >= 2) return externalType;

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
    suggestion.skus.find((sku) => sku.language)?.language;
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
  const inferred =
    codeByName[normalized] ??
    source.replace(/[^A-Za-z]/g, "").slice(0, 8).toUpperCase();
  return inferred.length >= 2 ? inferred : "EN";
}

function boundedName(
  value: string | null,
  fallback: string,
  warnings: string[],
  warning: string,
): string {
  const cleaned = cleanExternalText(value ?? "").slice(0, 160);
  if (cleaned.length >= 2) return cleaned;
  warnings.push(warning);
  return fallback.slice(0, 160);
}

function nullableText(value: string | null, max: number): string | null {
  const cleaned = cleanExternalText(value ?? "").slice(0, max);
  return cleaned || null;
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

function exactIsoDateOrNull(value: string | null): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== value
    ? null
    : value;
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}
