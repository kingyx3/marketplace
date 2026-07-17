import { badRequest } from "@/lib/api/errors";

export interface AdminCatalogProductInput {
  productId: string | null;
  categoryId: string;
  setId: string | null;
  slug: string;
  name: string;
  productType: string;
  description: string | null;
  language: string;
  imageUrl: string | null;
  active: boolean;
}

export interface AdminCatalogProductCreateInput
  extends Omit<AdminCatalogProductInput, "productId" | "categoryId"> {
  categoryId: string | null;
  newCategoryName: string | null;
  newCategorySlug: string | null;
  newCategoryPublisher: string | null;
}

export interface AdminCatalogSkuInput {
  skuId: string | null;
  productId: string;
  sku: string;
  barcode: string | null;
  packsPerBox: number | null;
  cardsPerPack: number | null;
  msrpCents: number | null;
  priceCents: number;
  currency: string;
  weightGrams: number | null;
  active: boolean;
}

export interface AdminInventoryAdjustmentInput {
  skuId: string;
  onHand: number;
  incoming: number;
  safetyStock: number;
  reasonCode: string;
  reasonNote: string | null;
}

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const CURRENCY_PATTERN = /^[A-Z]{3}$/;
const LANGUAGE_PATTERN = /^[A-Z]{2,8}$/;

export function adminCatalogProductFromForm(formData: FormData): AdminCatalogProductInput {
  const base = productFieldsFromForm(formData);
  return {
    productId: optionalString(formData, "productId") ?? null,
    categoryId: requiredString(formData, "categoryId"),
    ...base,
  };
}

export function adminCatalogProductCreateFromForm(
  formData: FormData
): AdminCatalogProductCreateInput {
  const base = productFieldsFromForm(formData);
  const categoryMode = optionalString(formData, "categoryMode") ?? "existing";
  const categoryId = categoryMode === "new" ? null : optionalString(formData, "categoryId") ?? null;
  const newCategoryName = optionalString(formData, "newCategoryName") ?? null;
  const newCategorySlugRaw = optionalString(formData, "newCategorySlug")?.toLowerCase() ?? null;

  if (!categoryId && !newCategoryName) {
    throw badRequest("Select a category or add a new category");
  }
  if (!categoryId && !newCategorySlugRaw) {
    throw badRequest("New category slug is required");
  }
  if (newCategorySlugRaw && !SLUG_PATTERN.test(newCategorySlugRaw)) {
    throw badRequest("new category slug must use lowercase words separated by hyphens");
  }

  return {
    categoryId,
    newCategoryName,
    newCategorySlug: newCategorySlugRaw,
    newCategoryPublisher: optionalString(formData, "newCategoryPublisher") ?? null,
    ...base,
  };
}

function productFieldsFromForm(
  formData: FormData
): Omit<AdminCatalogProductInput, "productId" | "categoryId"> {
  const slug = requiredString(formData, "slug").toLowerCase();
  const language = (optionalString(formData, "language") ?? "EN").toUpperCase();

  if (!SLUG_PATTERN.test(slug)) {
    throw badRequest("slug must use lowercase words separated by hyphens");
  }
  if (!LANGUAGE_PATTERN.test(language)) {
    throw badRequest("language must be 2-8 uppercase letters");
  }

  return {
    setId: optionalString(formData, "setId") ?? null,
    slug,
    name: requiredString(formData, "name"),
    productType: requiredString(formData, "productType").toLowerCase(),
    description: optionalString(formData, "description") ?? null,
    language,
    imageUrl: optionalString(formData, "imageUrl") ?? null,
    active: booleanField(formData, "active", true),
  };
}

export function adminCatalogSkuFromForm(formData: FormData): AdminCatalogSkuInput {
  const currency = requiredString(formData, "currency").toUpperCase();
  if (!CURRENCY_PATTERN.test(currency)) {
    throw badRequest("currency must be a 3-letter code");
  }

  return {
    skuId: optionalString(formData, "skuId") ?? null,
    productId: requiredString(formData, "productId"),
    sku: requiredString(formData, "sku").toUpperCase(),
    barcode: optionalString(formData, "barcode") ?? null,
    packsPerBox: optionalNonNegativeInteger(formData, "packsPerBox"),
    cardsPerPack: optionalNonNegativeInteger(formData, "cardsPerPack"),
    msrpCents: optionalNonNegativeInteger(formData, "msrpCents"),
    priceCents: requiredNonNegativeInteger(formData, "priceCents"),
    currency,
    weightGrams: optionalNonNegativeInteger(formData, "weightGrams"),
    active: booleanField(formData, "active", true),
  };
}

export function adminInventoryAdjustmentFromForm(
  formData: FormData
): AdminInventoryAdjustmentInput {
  const reasonCode = requiredString(formData, "reasonCode").toLowerCase();
  if (!["stock_count", "damage", "supplier_update", "correction", "other"].includes(reasonCode)) {
    throw badRequest("invalid inventory reason code");
  }

  return {
    skuId: requiredString(formData, "skuId"),
    onHand: requiredNonNegativeInteger(formData, "onHand"),
    incoming: requiredNonNegativeInteger(formData, "incoming"),
    safetyStock: requiredNonNegativeInteger(formData, "safetyStock"),
    reasonCode,
    reasonNote: optionalString(formData, "reasonNote") ?? null,
  };
}

function requiredString(formData: FormData, key: string): string {
  const value = optionalString(formData, key);
  if (!value) {
    throw badRequest(`${key} is required`);
  }
  return value;
}

function optionalString(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function requiredNonNegativeInteger(formData: FormData, key: string): number {
  const value = requiredInteger(formData, key);
  if (value < 0) {
    throw badRequest(`${key} must be non-negative`);
  }
  return value;
}

function optionalNonNegativeInteger(formData: FormData, key: string): number | null {
  const raw = optionalString(formData, key);
  if (!raw) return null;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) {
    throw badRequest(`${key} must be a non-negative integer`);
  }
  return value;
}

function requiredInteger(formData: FormData, key: string): number {
  const raw = requiredString(formData, key);
  const value = Number(raw);
  if (!Number.isInteger(value)) {
    throw badRequest(`${key} must be an integer`);
  }
  return value;
}

function booleanField(formData: FormData, key: string, defaultValue: boolean): boolean {
  const values = formData.getAll(key);
  if (values.length === 0) return defaultValue;
  return values.some((value) => value === "true" || value === "on");
}
