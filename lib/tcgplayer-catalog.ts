const TCGPLAYER_PRODUCT_DETAILS_API =
  "https://mp-search-api.tcgplayer.com/v2/product";
const TCGPLAYER_PRODUCT_ENRICHMENT_API =
  "https://mpapi.tcgplayer.com/v2/product";
const MAX_UPSTREAM_RESPONSE_BYTES = 2_000_000;
const UPSTREAM_TIMEOUT_MS = 10_000;

export type TcgplayerPricePoint = {
  providerVariantId: number | null;
  productConditionId: number | null;
  condition: string | null;
  language: string | null;
  printing: string | null;
  marketPrice: number | null;
  lowPrice: number | null;
  midPrice: number | null;
  highPrice: number | null;
  directLowPrice: number | null;
};

export type TcgplayerVariantReference = {
  providerVariantId: number | null;
  productConditionId: number | null;
  conditionId: number | null;
  languageId: number | null;
  printingId: number | null;
  variantId: number | null;
  condition: string | null;
  language: string | null;
  printing: string | null;
  barcode: string | null;
  packsPerBox: number | null;
  cardsPerPack: number | null;
  weightGrams: number | null;
  marketPrice: number | null;
  lowPrice: number | null;
  midPrice: number | null;
  highPrice: number | null;
  directLowPrice: number | null;
};

export type TcgplayerCatalogSuggestion = {
  provider: "tcgplayer-storefront";
  productId: number;
  sourceUrl: string;
  fetchedAt: string;
  product: {
    name: string;
    cleanName: string | null;
    description: string | null;
    imageUrl: string | null;
    productType: string | null;
    language: string | null;
    upc: string | null;
    packsPerBox: number | null;
    cardsPerPack: number | null;
    weightGrams: number | null;
  };
  category: {
    id: number | null;
    name: string | null;
    publisher: string | null;
  };
  set: {
    id: number | null;
    name: string | null;
    code: string | null;
    releaseDate: string | null;
  };
  prices: TcgplayerPricePoint[];
  variants: TcgplayerVariantReference[];
  warnings: string[];
};

export class TcgplayerCatalogError extends Error {
  readonly kind:
    | "invalid_reference"
    | "not_found"
    | "upstream_unavailable"
    | "invalid_response";

  constructor(
    kind: TcgplayerCatalogError["kind"],
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "TcgplayerCatalogError";
    this.kind = kind;
  }
}

type FetchImplementation = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

type NormalizationInput = {
  productId: number;
  details: unknown;
  prices?: unknown;
  variants?: unknown;
  warnings?: string[];
  fetchedAt?: string;
};

export function parseTcgplayerProductId(reference: string): number {
  const value = reference.trim();
  if (/^\d{1,12}$/.test(value)) return positiveProductId(value);

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new TcgplayerCatalogError(
      "invalid_reference",
      "Enter a TCGplayer product URL or numeric product ID.",
    );
  }

  const host = url.hostname.toLowerCase();
  if (host !== "tcgplayer.com" && !host.endsWith(".tcgplayer.com")) {
    throw new TcgplayerCatalogError(
      "invalid_reference",
      "The product URL must be hosted on tcgplayer.com.",
    );
  }

  const segments = url.pathname.split("/").filter(Boolean);
  const productIndex = segments.findIndex(
    (segment) => segment.toLowerCase() === "product",
  );
  const candidate = productIndex >= 0 ? segments[productIndex + 1] : undefined;
  if (!candidate || !/^\d{1,12}$/.test(candidate)) {
    throw new TcgplayerCatalogError(
      "invalid_reference",
      "The TCGplayer URL does not contain a numeric product ID.",
    );
  }

  return positiveProductId(candidate);
}

export async function fetchTcgplayerCatalogSuggestion(
  reference: string,
  options: { fetchImplementation?: FetchImplementation; now?: () => Date } = {},
): Promise<TcgplayerCatalogSuggestion> {
  const productId = parseTcgplayerProductId(reference);
  const fetchImplementation = options.fetchImplementation ?? fetch;
  const warnings: string[] = [];

  const details = await fetchJson(
    `${TCGPLAYER_PRODUCT_DETAILS_API}/${productId}/details`,
    fetchImplementation,
    true,
  );
  const detailsRecord = unwrapRecord(details);
  const embeddedPrices = normalizePricePoints(undefined, detailsRecord);
  const embeddedVariants = normalizeVariants(detailsRecord);
  const [prices, variants] = await Promise.all([
    fetchOptionalJson(
      `${TCGPLAYER_PRODUCT_ENRICHMENT_API}/${productId}/pricepoints`,
      fetchImplementation,
    ),
    fetchOptionalJson(
      `${TCGPLAYER_PRODUCT_ENRICHMENT_API}/${productId}/skus`,
      fetchImplementation,
    ),
  ]);

  if (!prices.ok && embeddedPrices.length === 0) {
    warnings.push(
      "Live price points were unavailable; review pricing manually.",
    );
  }
  if (!variants.ok && embeddedVariants.length === 0) {
    warnings.push(
      "TCGplayer sellable variants were unavailable; review the product references manually.",
    );
  }

  return normalizeTcgplayerCatalog({
    productId,
    details,
    prices: prices.ok ? prices.value : detailsRecord,
    variants: variants.ok ? variants.value : detailsRecord,
    warnings,
    fetchedAt: (options.now?.() ?? new Date()).toISOString(),
  });
}

export function normalizeTcgplayerCatalog(
  input: NormalizationInput,
): TcgplayerCatalogSuggestion {
  const details = unwrapRecord(input.details);
  const customAttributes = asRecord(
    getCaseInsensitive(details, "customAttributes"),
  );
  const normalizedPrices = normalizePricePoints(input.prices, details);
  const enrichmentVariants = normalizeVariants(input.variants);
  const sourceVariants =
    enrichmentVariants.length > 0 ? enrichmentVariants : normalizeVariants(details);
  const normalizedVariants = enrichVariantsWithPrices(sourceVariants, normalizedPrices);
  const variantLanguages = uniqueStrings(
    normalizedVariants
      .map((variant) => variant.language)
      .filter((language): language is string => Boolean(language)),
  );
  const name =
    readString(details, ["productName", "name", "cleanName", "title"]) ??
    `TCGplayer product ${input.productId}`;
  const cleanName = readString(details, ["cleanName", "cleanProductName"]);
  const categoryName = readNamedValue(details, [
    "categoryName",
    "productLineName",
    "category",
    "gameName",
  ]);
  const setName = readNamedValue(details, [
    "groupName",
    "setName",
    "group",
    "set",
  ]);
  const productType = readNamedValue(details, [
    "productTypeName",
    "productType",
    "typeName",
  ]);
  const canonicalSourceUrl = `https://www.tcgplayer.com/product/${input.productId}`;
  const sourceUrl =
    safeTcgplayerUrl(
      readString(details, ["url", "productUrl", "tcgplayerUrl"]),
    ) ?? canonicalSourceUrl;
  const warnings = [...(input.warnings ?? [])];
  const releaseDate =
    readString(details, ["releaseDate", "publishedOn"]) ??
    (customAttributes
      ? readString(customAttributes, ["releaseDate", "publishedOn"])
      : null);
  const description =
    readString(details, ["description", "productDescription"]) ??
    (customAttributes
      ? readString(customAttributes, ["description", "productDescription"])
      : null);
  const language =
    readNamedValue(details, ["languageName", "language"]) ??
    (variantLanguages.length === 1 ? variantLanguages[0] : null);

  if (!categoryName) warnings.push("TCGplayer did not return a category name.");
  if (!setName) warnings.push("TCGplayer did not return a set or group name.");
  if (!productType) warnings.push("TCGplayer did not return a product type.");

  return {
    provider: "tcgplayer-storefront",
    productId: input.productId,
    sourceUrl,
    fetchedAt: input.fetchedAt ?? new Date().toISOString(),
    product: {
      name,
      cleanName,
      description,
      imageUrl: safeHttpUrl(
        readString(details, ["imageUrl", "imageURL", "image", "imageUri"]),
      ),
      productType,
      language,
      upc:
        readString(details, ["upc", "barcode", "gtin"]) ??
        (customAttributes
          ? readString(customAttributes, ["upc", "barcode", "gtin"])
          : null),
      packsPerBox: readPhysicalInteger(details, customAttributes, [
        "packsPerBox",
        "packCount",
        "numberOfPacks",
      ]),
      cardsPerPack: readPhysicalInteger(details, customAttributes, [
        "cardsPerPack",
        "cardCountPerPack",
        "numberOfCardsPerPack",
      ]),
      weightGrams: readPhysicalInteger(details, customAttributes, [
        "weightGrams",
        "packageWeightGrams",
        "shippingWeightGrams",
      ]),
    },
    category: {
      id: readNumber(details, ["categoryId", "productLineId"]),
      name: categoryName,
      publisher: readNamedValue(details, [
        "publisherName",
        "manufacturerName",
        "publisher",
        "manufacturer",
      ]),
    },
    set: {
      id: readNumber(details, ["groupId", "setId"]),
      name: setName,
      code: readString(details, [
        "groupAbbreviation",
        "setCode",
        "abbreviation",
      ]),
      releaseDate: normalizeDate(releaseDate),
    },
    prices: normalizedPrices,
    variants: normalizedVariants,
    warnings: uniqueStrings(warnings),
  };
}

async function fetchOptionalJson(
  url: string,
  fetchImplementation: FetchImplementation,
): Promise<{ ok: true; value: unknown } | { ok: false }> {
  try {
    return {
      ok: true,
      value: await fetchJson(url, fetchImplementation, false),
    };
  } catch {
    return { ok: false };
  }
}

async function fetchJson(
  url: string,
  fetchImplementation: FetchImplementation,
  required: boolean,
): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort("tcgplayer_timeout"),
    UPSTREAM_TIMEOUT_MS,
  );

  try {
    const response = await fetchImplementation(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "User-Agent": "MarketplaceCatalogAssist/1.0",
      },
      cache: "no-store",
      redirect: "error",
      signal: controller.signal,
    });

    if (response.status === 404 && required) {
      throw new TcgplayerCatalogError(
        "not_found",
        "TCGplayer product not found.",
      );
    }
    if (!response.ok) {
      throw new TcgplayerCatalogError(
        "upstream_unavailable",
        "TCGplayer catalog data is temporarily unavailable.",
      );
    }

    const contentLength = Number(response.headers.get("content-length") ?? 0);
    if (
      Number.isFinite(contentLength) &&
      contentLength > MAX_UPSTREAM_RESPONSE_BYTES
    ) {
      throw new TcgplayerCatalogError(
        "invalid_response",
        "TCGplayer returned an oversized response.",
      );
    }

    const body = await response.text();
    if (
      new TextEncoder().encode(body).byteLength > MAX_UPSTREAM_RESPONSE_BYTES
    ) {
      throw new TcgplayerCatalogError(
        "invalid_response",
        "TCGplayer returned an oversized response.",
      );
    }

    try {
      return JSON.parse(body) as unknown;
    } catch (error) {
      throw new TcgplayerCatalogError(
        "invalid_response",
        "TCGplayer returned an unreadable response.",
        { cause: error },
      );
    }
  } catch (error) {
    if (error instanceof TcgplayerCatalogError) throw error;
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new TcgplayerCatalogError(
        "upstream_unavailable",
        "TCGplayer did not respond before the request timed out.",
        { cause: error },
      );
    }
    throw new TcgplayerCatalogError(
      "upstream_unavailable",
      "TCGplayer catalog data is temporarily unavailable.",
      { cause: error },
    );
  } finally {
    clearTimeout(timeout);
  }
}

function positiveProductId(value: string): number {
  const productId = Number(value);
  if (!Number.isSafeInteger(productId) || productId <= 0) {
    throw new TcgplayerCatalogError(
      "invalid_reference",
      "TCGplayer product ID is invalid.",
    );
  }
  return productId;
}

function normalizePricePoints(
  payload: unknown,
  details: Record<string, unknown>,
): TcgplayerPricePoint[] {
  const records = extractRecords(payload, [
    "pricePoints",
    "prices",
    "results",
    "data",
  ]);
  if (records.length === 0) {
    const marketPrice = readNumber(details, ["marketPrice"]);
    const lowPrice = readNumber(details, ["lowPrice", "lowestPrice"]);
    if (marketPrice === null && lowPrice === null) return [];
    records.push(details);
  }

  return records.slice(0, 30).map((record) => ({
    providerVariantId: readNumber(record, ["skuId", "sku"]),
    productConditionId: readNumber(record, ["productConditionId"]),
    condition: readNamedValue(record, ["conditionName", "condition"]),
    language: readNamedValue(record, ["languageName", "language"]),
    printing: readNamedValue(record, [
      "printingName",
      "subTypeName",
      "printing",
      "variant",
    ]),
    marketPrice: readNumber(record, ["marketPrice"]),
    lowPrice: readNumber(record, ["lowPrice", "lowestPrice"]),
    midPrice: readNumber(record, ["midPrice", "medianPrice"]),
    highPrice: readNumber(record, ["highPrice"]),
    directLowPrice: readNumber(record, ["directLowPrice"]),
  }));
}

function enrichVariantsWithPrices(
  variants: TcgplayerVariantReference[],
  prices: TcgplayerPricePoint[],
): TcgplayerVariantReference[] {
  return variants.map((variant) => {
    if (
      variant.marketPrice !== null &&
      variant.lowPrice !== null &&
      variant.midPrice !== null &&
      variant.highPrice !== null &&
      variant.directLowPrice !== null
    ) {
      return variant;
    }

    const exactIdMatch = prices.find(
      (price) =>
        (variant.providerVariantId !== null && price.providerVariantId === variant.providerVariantId) ||
        (variant.productConditionId !== null &&
          price.productConditionId === variant.productConditionId),
    );
    const labelMatches = prices.filter((price) => priceLabelsMatch(variant, price));
    const matchedPrice =
      exactIdMatch ??
      (labelMatches.length === 1 ? labelMatches[0] : undefined) ??
      (variants.length === 1 && prices.length === 1 ? prices[0] : undefined);

    return matchedPrice
      ? {
          ...variant,
          marketPrice: variant.marketPrice ?? matchedPrice.marketPrice,
          lowPrice: variant.lowPrice ?? matchedPrice.lowPrice,
          midPrice: variant.midPrice ?? matchedPrice.midPrice,
          highPrice: variant.highPrice ?? matchedPrice.highPrice,
          directLowPrice: variant.directLowPrice ?? matchedPrice.directLowPrice,
        }
      : variant;
  });
}

function priceLabelsMatch(
  variant: TcgplayerVariantReference,
  price: TcgplayerPricePoint,
): boolean {
  const pairs = [
    [variant.condition, price.condition],
    [variant.language, price.language],
    [variant.printing, price.printing],
  ] as const;
  const comparable = pairs.filter(([left, right]) => left && right);
  return (
    comparable.length > 0 &&
    comparable.every(
      ([left, right]) =>
        normalizeComparable(left) === normalizeComparable(right),
    )
  );
}

function normalizeComparable(value: string | null): string {
  return (value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizeVariants(payload: unknown): TcgplayerVariantReference[] {
  return extractRecords(payload, ["variants", "skus", "results", "data"])
    .slice(0, 50)
    .map((record) => ({
      providerVariantId: readNumber(record, ["providerVariantId", "skuId", "sku", "id"]),
      productConditionId: readNumber(record, ["productConditionId"]),
      conditionId: readNumber(record, ["conditionId"]),
      languageId: readNumber(record, ["languageId"]),
      printingId: readNumber(record, ["printingId"]),
      variantId: readNumber(record, ["variantId"]),
      condition: readNamedValue(record, ["conditionName", "condition"]),
      language: readNamedValue(record, ["languageName", "language"]),
      printing: readNamedValue(record, [
        "printingName",
        "printing",
        "subTypeName",
        "variant",
      ]),
      barcode: readString(record, ["barcode", "upc", "gtin"]),
      packsPerBox: readPositiveInteger(record, [
        "packsPerBox",
        "packCount",
        "numberOfPacks",
      ]),
      cardsPerPack: readPositiveInteger(record, [
        "cardsPerPack",
        "cardCountPerPack",
        "numberOfCardsPerPack",
      ]),
      weightGrams: readPositiveInteger(record, [
        "weightGrams",
        "packageWeightGrams",
        "shippingWeightGrams",
      ]),
      marketPrice: readNumber(record, ["marketPrice"]),
      lowPrice: readNumber(record, ["lowPrice", "lowestPrice"]),
      midPrice: readNumber(record, ["midPrice", "medianPrice"]),
      highPrice: readNumber(record, ["highPrice"]),
      directLowPrice: readNumber(record, ["directLowPrice"]),
    }));
}

function readPhysicalInteger(
  details: Record<string, unknown>,
  customAttributes: Record<string, unknown> | null,
  keys: string[],
): number | null {
  return (
    readPositiveInteger(details, keys) ??
    (customAttributes ? readPositiveInteger(customAttributes, keys) : null)
  );
}

function readPositiveInteger(
  record: Record<string, unknown>,
  keys: string[],
): number | null {
  const value = readNumber(record, keys);
  return value !== null && Number.isSafeInteger(value) && value > 0
    ? value
    : null;
}

function unwrapRecord(value: unknown): Record<string, unknown> {
  const record = asRecord(value);
  if (!record) {
    throw new TcgplayerCatalogError(
      "invalid_response",
      "TCGplayer product details were missing.",
    );
  }

  for (const key of ["data", "result", "product", "content"]) {
    const nested = asRecord(getCaseInsensitive(record, key));
    if (nested) return nested;
  }

  return record;
}

function extractRecords(
  value: unknown,
  collectionKeys: string[],
): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.map(asRecord).filter(isRecord);
  const record = asRecord(value);
  if (!record) return [];

  for (const key of collectionKeys) {
    const candidate = getCaseInsensitive(record, key);
    if (Array.isArray(candidate))
      return candidate.map(asRecord).filter(isRecord);
    const nested = asRecord(candidate);
    if (nested) {
      const nestedRecords = extractRecords(nested, collectionKeys);
      if (nestedRecords.length > 0) return nestedRecords;
    }
  }

  return [];
}

function readNamedValue(
  record: Record<string, unknown>,
  keys: string[],
): string | null {
  for (const key of keys) {
    const value = getCaseInsensitive(record, key);
    const direct = stringValue(value);
    if (direct) return direct;
    const nested = asRecord(value);
    if (nested) {
      const named = readString(nested, [
        "name",
        "displayName",
        "value",
        "label",
      ]);
      if (named) return named;
    }
  }
  return null;
}

function readString(
  record: Record<string, unknown>,
  keys: string[],
): string | null {
  for (const key of keys) {
    const value = stringValue(getCaseInsensitive(record, key));
    if (value) return value;
  }
  return null;
}

function readNumber(
  record: Record<string, unknown>,
  keys: string[],
): number | null {
  for (const key of keys) {
    const value = getCaseInsensitive(record, key);
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() !== "") {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
}

function getCaseInsensitive(
  record: Record<string, unknown>,
  expectedKey: string,
): unknown {
  const direct = record[expectedKey];
  if (direct !== undefined) return direct;
  const matchedKey = Object.keys(record).find(
    (key) => key.toLowerCase() === expectedKey.toLowerCase(),
  );
  return matchedKey ? record[matchedKey] : undefined;
}

function stringValue(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function safeTcgplayerUrl(value: string | null): string | null {
  const url = safeHttpUrl(value);
  if (!url) return null;
  const host = new URL(url).hostname.toLowerCase();
  return host === "tcgplayer.com" || host.endsWith(".tcgplayer.com")
    ? url
    : null;
}

function safeHttpUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:"
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

function normalizeDate(value: string | null): string | null {
  if (!value) return null;
  const match = value.match(/^\d{4}-\d{2}-\d{2}/);
  return match?.[0] ?? null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function isRecord(
  value: Record<string, unknown> | null,
): value is Record<string, unknown> {
  return value !== null;
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}
