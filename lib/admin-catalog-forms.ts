import { badRequest } from "@/lib/api/errors";
import { setCodeFromName, slugFromName } from "@/lib/catalog-identifiers";

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
  newSetName: string | null;
  newSetCode: string | null;
  newSetReleaseDate: string | null;
  newSetStatus: SetStatus | null;
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
const SET_CODE_PATTERN = /^[A-Z0-9][A-Z0-9_-]{1,15}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const CURRENCY_PATTERN = /^[A-Z]{3}$/;
const LANGUAGE_PATTERN = /^[A-Z]{2,8}$/;
const SET_STATUSES = [
  "announced",
  "preorder_open",
  "preorder_closed",
  "released",
  "out_of_print",
] as const;

type SetStatus = (typeof SET_STATUSES)[number];
type SetMode = "none" | "existing" | "new";

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
  const newCategoryName =
    categoryMode === "new" ? optionalString(formData, "newCategoryName") ?? null : null;
  const newCategorySlug = newCategoryName ? slugFromName(newCategoryName) : null;

  if (!categoryId && !newCategoryName) {
    throw badRequest("Select a category or add a new category");
  }
  if (newCategoryName && (!newCategorySlug || !SLUG_PATTERN.test(newCategorySlug))) {
    throw badRequest("New category name must contain letters or numbers for its generated slug");
  }

  const setMode = parseSetMode(formData, base.setId);
  if (categoryMode === "new" && setMode === "existing") {
    throw badRequest("Create or select the category before choosing an existing set");
  }

  let setId: string | null = null;
  let newSetName: string | null = null;
  let newSetCode: string | null = null;
  let newSetReleaseDate: string | null = null;
  let newSetStatus: SetStatus | null = null;

  if (setMode === "existing") {
    setId = base.setId;
    if (!setId) throw badRequest("Select an existing set");
  }

  if (setMode === "new") {
    newSetName = optionalString(formData, "newSetName") ?? null;
    newSetCode = newSetName ? setCodeFromName(newSetName) : null;
    newSetReleaseDate = optionalString(formData, "newSetReleaseDate") ?? null;
    newSetStatus = parseSetStatus(optionalString(formData, "newSetStatus") ?? "announced");

    if (!newSetName) throw badRequest("New set name is required");
    if (!newSetCode || !SET_CODE_PATTERN.test(newSetCode)) {
      throw badRequest("New set name must contain letters or numbers for its generated code");
    }
    if (newSetReleaseDate && !DATE_PATTERN.test(newSetReleaseDate)) {
      throw badRequest("new set release date must use YYYY-MM-DD");
    }
  }

  return {
    categoryId,
    newCategoryName,
    newCategorySlug,
    newCategoryPublisher:
      categoryMode === "new" ? optionalString(formData, "newCategoryPublisher") ?? null : null,
    ...base,
    setId,
    newSetName,
    newSetCode,
    newSetReleaseDate,
    newSetStatus,
  };
}

function parseSetMode(formData: FormData, setId: string | null): SetMode {
  const value = optionalString(formData, "setMode") ?? (setId ? "existing" : "none");
  if (value !== "none" && value !== "existing" && value !== "new") {
    throw badRequest("Invalid set selection mode");
  }
  return value;
}

function parseSetStatus(value: string): SetStatus {
  if (!SET_STATUSES.includes(value as SetStatus)) {
    throw badRequest("Invalid set status");
  }
  return value as SetStatus;
}

function productFieldsFromForm(
  formData: FormData
): Omit<AdminCatalogProductInput, "productId" | "categoryId"> {
  const name = requiredString(formData, "name");
  const slug = slugFromName(name);
  const language = (optionalString(formData, "language") ?? "EN").toUpperCase();

  if (!slug || !SLUG_PATTERN.test(slug)) {
    throw badRequest("Product name must contain letters or numbers for its generated slug");
  }
  if (!LANGUAGE_PATTERN.test(language)) {
    throw badRequest("language must be 2-8 uppercase letters");
  }

  return {
    setId: optionalString(formData, "setId") ?? null,
    slug,
    name,
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
