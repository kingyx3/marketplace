import { badRequest } from "@/lib/api/errors";
import {
  productTypeCodeFromName,
  setCodeFromName,
  slugFromName,
} from "@/lib/catalog-identifiers";

export interface AdminCatalogProductInput {
  productId: string | null;
  name: string;
  categoryId: string;
  setId: string;
  productType: string;
  description: string | null;
  language: string;
  imageUrl: string | null;
  active: boolean;
}

export interface AdminCatalogProductCreateInput
  extends Omit<AdminCatalogProductInput, "productId" | "categoryId" | "setId" | "productType"> {
  categoryId: string | null;
  newCategoryName: string | null;
  newCategorySlug: string | null;
  newCategoryPublisher: string | null;
  setId: string | null;
  newSetName: string | null;
  newSetCode: string | null;
  newSetReleaseDate: string | null;
  newSetStatus: SetStatus | null;
  productType: string | null;
  newProductTypeName: string | null;
  newProductTypeCode: string | null;
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
const PRODUCT_TYPE_PATTERN = /^[a-z][a-z0-9_]{0,63}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const CURRENCY_PATTERN = /^[A-Z]{3}$/;
const LANGUAGE_PATTERN = /^[A-Z]{2,8}$/;
const SKU_PATTERN = /^[A-Z0-9][A-Z0-9._-]{0,63}$/;
const SET_STATUSES = [
  "announced",
  "preorder_open",
  "preorder_closed",
  "released",
  "out_of_print",
] as const;

type SetStatus = (typeof SET_STATUSES)[number];
type SetMode = "existing" | "new";
type ProductTypeMode = "existing" | "new";

export function adminCatalogProductFromForm(formData: FormData): AdminCatalogProductInput {
  const productType = requiredString(formData, "productType").toLowerCase();
  if (!PRODUCT_TYPE_PATTERN.test(productType)) {
    throw badRequest("Select a valid product type");
  }

  return {
    productId: optionalString(formData, "productId") ?? null,
    categoryId: requiredString(formData, "categoryId"),
    setId: requiredString(formData, "setId"),
    productType,
    ...commonProductFieldsFromForm(formData),
  };
}

export function adminCatalogProductCreateFromForm(
  formData: FormData
): AdminCatalogProductCreateInput {
  const categoryMode = optionalString(formData, "categoryMode") ?? "existing";
  const categoryId = categoryMode === "new" ? null : optionalString(formData, "categoryId") ?? null;
  const newCategoryName =
    categoryMode === "new" ? optionalString(formData, "newCategoryName") ?? null : null;
  const newCategorySlug = newCategoryName ? slugFromName(newCategoryName) : null;

  if (!categoryId && !newCategoryName) {
    throw badRequest("Select a category or add a new category");
  }
  if (newCategoryName && newCategoryName.length > 160) {
    throw badRequest("New category name must be 160 characters or fewer");
  }
  if (newCategoryName && (!newCategorySlug || !SLUG_PATTERN.test(newCategorySlug))) {
    throw badRequest("New category name must contain letters or numbers for its generated slug");
  }

  const setMode = parseSetMode(formData);
  if (categoryMode === "new" && setMode === "existing") {
    throw badRequest("Add a set for the new category before creating its product");
  }

  let setId: string | null = null;
  let newSetName: string | null = null;
  let newSetCode: string | null = null;
  let newSetReleaseDate: string | null = null;
  let newSetStatus: SetStatus | null = null;

  if (setMode === "existing") {
    setId = optionalString(formData, "setId") ?? null;
    if (!setId) throw badRequest("Select an existing set");
  } else {
    newSetName = optionalString(formData, "newSetName") ?? null;
    newSetCode = newSetName ? setCodeFromName(newSetName) : null;
    newSetReleaseDate = optionalString(formData, "newSetReleaseDate") ?? null;
    newSetStatus = parseSetStatus(optionalString(formData, "newSetStatus") ?? "announced");

    if (!newSetName) throw badRequest("New set name is required");
    if (newSetName.length > 160) throw badRequest("New set name must be 160 characters or fewer");
    if (!newSetCode || !SET_CODE_PATTERN.test(newSetCode)) {
      throw badRequest("New set name must contain letters or numbers for its generated code");
    }
    if (newSetReleaseDate && !DATE_PATTERN.test(newSetReleaseDate)) {
      throw badRequest("new set release date must use YYYY-MM-DD");
    }
  }

  const productTypeMode = parseProductTypeMode(formData);
  let productType: string | null = null;
  let newProductTypeName: string | null = null;
  let newProductTypeCode: string | null = null;

  if (productTypeMode === "existing") {
    productType = optionalString(formData, "productType")?.toLowerCase() ?? null;
    if (!productType) throw badRequest("Select a product type");
    if (!PRODUCT_TYPE_PATTERN.test(productType)) throw badRequest("Select a valid product type");
  } else {
    newProductTypeName = optionalString(formData, "newProductTypeName") ?? null;
    newProductTypeCode = newProductTypeName
      ? productTypeCodeFromName(newProductTypeName)
      : null;
    if (!newProductTypeName) throw badRequest("New product type name is required");
    if (newProductTypeName.length > 160) {
      throw badRequest("New product type name must be 160 characters or fewer");
    }
    if (!newProductTypeCode || !PRODUCT_TYPE_PATTERN.test(newProductTypeCode)) {
      throw badRequest("New product type name must contain letters or numbers");
    }
  }

  return {
    categoryId,
    newCategoryName,
    newCategorySlug,
    newCategoryPublisher:
      categoryMode === "new" ? optionalString(formData, "newCategoryPublisher") ?? null : null,
    setId,
    newSetName,
    newSetCode,
    newSetReleaseDate,
    newSetStatus,
    productType,
    newProductTypeName,
    newProductTypeCode,
    ...commonProductFieldsFromForm(formData),
  };
}

function parseSetMode(formData: FormData): SetMode {
  const value = optionalString(formData, "setMode") ?? "existing";
  if (value !== "existing" && value !== "new") {
    throw badRequest("Select an existing set or add a new set");
  }
  return value;
}

function parseProductTypeMode(formData: FormData): ProductTypeMode {
  const value = optionalString(formData, "productTypeMode") ?? "existing";
  if (value !== "existing" && value !== "new") {
    throw badRequest("Select an existing product type or add a new product type");
  }
  return value;
}

function parseSetStatus(value: string): SetStatus {
  if (!SET_STATUSES.includes(value as SetStatus)) {
    throw badRequest("Invalid set status");
  }
  return value as SetStatus;
}

function commonProductFieldsFromForm(
  formData: FormData
): Pick<AdminCatalogProductInput, "name" | "description" | "language" | "imageUrl" | "active"> {
  const name = requiredString(formData, "name");
  const generatedSlug = slugFromName(name);
  if (name.length > 160) throw badRequest("Display name must be 160 characters or fewer");
  if (!generatedSlug || !SLUG_PATTERN.test(generatedSlug)) {
    throw badRequest("Display name must contain letters or numbers for its generated slug");
  }

  const description = optionalString(formData, "description") ?? null;
  if (description && description.length > 2000) {
    throw badRequest("Description must be 2000 characters or fewer");
  }

  const language = (optionalString(formData, "language") ?? "EN").toUpperCase();
  if (!LANGUAGE_PATTERN.test(language)) {
    throw badRequest("language must be 2-8 uppercase letters");
  }

  const imageUrl = optionalString(formData, "imageUrl") ?? null;
  if (imageUrl) assertHttpUrl(imageUrl, "Image URL");

  return {
    name,
    description,
    language,
    imageUrl,
    active: booleanField(formData, "active", true),
  };
}

export function adminCatalogSkuFromForm(formData: FormData): AdminCatalogSkuInput {
  const currency = requiredString(formData, "currency").toUpperCase();
  if (!CURRENCY_PATTERN.test(currency)) {
    throw badRequest("currency must be a 3-letter code");
  }

  const sku = requiredString(formData, "sku").toUpperCase();
  if (!SKU_PATTERN.test(sku)) {
    throw badRequest("SKU must be 1-64 characters using letters, numbers, dots, hyphens, or underscores");
  }

  const barcode = optionalString(formData, "barcode") ?? null;
  if (barcode && barcode.length > 64) throw badRequest("Barcode must be 64 characters or fewer");

  return {
    skuId: optionalString(formData, "skuId") ?? null,
    productId: requiredString(formData, "productId"),
    sku,
    barcode,
    packsPerBox: optionalNonNegativeInteger(formData, "packsPerBox"),
    cardsPerPack: optionalNonNegativeInteger(formData, "cardsPerPack"),
    msrpCents: optionalNonNegativeInteger(formData, "msrpCents"),
    priceCents: requiredPositiveInteger(formData, "priceCents"),
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

function assertHttpUrl(value: string, label: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw badRequest(`${label} must be a valid URL`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw badRequest(`${label} must use http or https`);
  }
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

function requiredPositiveInteger(formData: FormData, key: string): number {
  const value = requiredInteger(formData, key);
  if (value <= 0) {
    throw badRequest(`${key} must be positive`);
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
