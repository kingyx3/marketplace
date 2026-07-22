import { badRequest } from "@/lib/api/errors";
import {
  assertHttpUrl,
  booleanField,
  isExactIsoDate,
  optionalInteger,
  optionalString,
  optionalUuid,
  requiredInteger,
  requiredString,
  requiredUuid,
} from "@/lib/admin-form-values";
import { productTypeCodeFromName, setCodeFromName, slugFromName } from "@/lib/catalog-identifiers";

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
  referenceCode: string | null;
  barcode: string | null;
  packsPerBox: number | null;
  cardsPerPack: number | null;
  weightGrams: number | null;
}

export interface AdminCatalogProductCreateInput extends Omit<
  AdminCatalogProductInput,
  "productId" | "categoryId" | "setId" | "productType"
> {
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

export interface AdminInventoryAdjustmentInput {
  productId: string;
  onHand: number;
  incoming: number;
  safetyStock: number;
  reasonCode: string;
  reasonNote: string | null;
}

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SET_CODE_PATTERN = /^[A-Z0-9][A-Z0-9_-]{1,15}$/;
const PRODUCT_TYPE_PATTERN = /^[a-z][a-z0-9_]{0,63}$/;
const LANGUAGE_PATTERN = /^[A-Z]{2,8}$/;
const PRODUCT_REFERENCE_PATTERN = /^[A-Z0-9][A-Z0-9._-]{0,63}$/;
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

  const referenceCode =
    optionalString(formData, "referenceCode", { max: 64 })?.toUpperCase() ?? null;
  if (referenceCode && !PRODUCT_REFERENCE_PATTERN.test(referenceCode)) {
    throw badRequest(
      "Product reference must use letters, numbers, dots, hyphens, or underscores",
    );
  }

  return {
    productId: optionalUuid(formData, "productId", "productId"),
    categoryId: requiredUuid(formData, "categoryId", "categoryId"),
    setId: requiredUuid(formData, "setId", "setId"),
    productType,
    referenceCode,
    barcode: optionalString(formData, "barcode", { max: 64, label: "Barcode" }) ?? null,
    packsPerBox: optionalInteger(formData, "packsPerBox", { min: 1 }),
    cardsPerPack: optionalInteger(formData, "cardsPerPack", { min: 1 }),
    weightGrams: optionalInteger(formData, "weightGrams", { min: 1 }),
    ...commonProductFieldsFromForm(formData),
  };
}

export function adminCatalogProductCreateFromForm(
  formData: FormData
): AdminCatalogProductCreateInput {
  const categoryMode = optionalString(formData, "categoryMode") ?? "existing";
  if (categoryMode !== "existing" && categoryMode !== "new") {
    throw badRequest("Select an existing category or add a new category");
  }
  const categoryId =
    categoryMode === "new" ? null : optionalUuid(formData, "categoryId", "categoryId");
  const newCategoryName =
    categoryMode === "new"
      ? (optionalString(formData, "newCategoryName", { max: 160 }) ?? null)
      : null;
  const newCategorySlug = newCategoryName ? slugFromName(newCategoryName) : null;

  if (!categoryId && !newCategoryName) {
    throw badRequest("Select a category or add a new category");
  }
  if (newCategoryName && newCategoryName.length < 2) {
    throw badRequest("New category name must be at least 2 characters");
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
    setId = optionalUuid(formData, "setId", "setId");
    if (!setId) throw badRequest("Select an existing set");
  } else {
    newSetName = optionalString(formData, "newSetName", { max: 160 }) ?? null;
    newSetCode = newSetName ? setCodeFromName(newSetName) : null;
    newSetReleaseDate = optionalString(formData, "newSetReleaseDate") ?? null;
    newSetStatus = parseSetStatus(optionalString(formData, "newSetStatus") ?? "announced");

    if (!newSetName) throw badRequest("New set name is required");
    if (newSetName.length < 2) throw badRequest("New set name must be at least 2 characters");
    if (!newSetCode || !SET_CODE_PATTERN.test(newSetCode)) {
      throw badRequest("New set name must contain letters or numbers for its generated code");
    }
    if (newSetReleaseDate && !isExactIsoDate(newSetReleaseDate)) {
      throw badRequest("new set release date must be a valid date using YYYY-MM-DD");
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
    newProductTypeName = optionalString(formData, "newProductTypeName", { max: 160 }) ?? null;
    newProductTypeCode = newProductTypeName ? productTypeCodeFromName(newProductTypeName) : null;
    if (!newProductTypeName) throw badRequest("New product type name is required");
    if (newProductTypeName.length < 2) {
      throw badRequest("New product type name must be at least 2 characters");
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
      categoryMode === "new"
        ? (optionalString(formData, "newCategoryPublisher", { max: 160 }) ?? null)
        : null,
    setId,
    newSetName,
    newSetCode,
    newSetReleaseDate,
    newSetStatus,
    productType,
    newProductTypeName,
    newProductTypeCode,
    referenceCode: null,
    barcode: null,
    packsPerBox: null,
    cardsPerPack: null,
    weightGrams: null,
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
  const name = requiredString(formData, "name", { min: 2, max: 160, label: "Display name" });
  const generatedSlug = slugFromName(name);
  if (!generatedSlug || !SLUG_PATTERN.test(generatedSlug)) {
    throw badRequest("Display name must contain letters or numbers for its generated slug");
  }

  const description =
    optionalString(formData, "description", {
      max: 2000,
      label: "Description",
    }) ?? null;

  const language = (optionalString(formData, "language") ?? "EN").toUpperCase();
  if (!LANGUAGE_PATTERN.test(language)) {
    throw badRequest("language must be 2-8 uppercase letters");
  }

  const imageUrl =
    optionalString(formData, "imageUrl", {
      max: 2048,
      label: "Image URL",
    }) ?? null;
  if (imageUrl) assertHttpUrl(imageUrl, "Image URL");

  return {
    name,
    description,
    language,
    imageUrl,
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
    productId: requiredUuid(formData, "productId", "productId"),
    onHand: requiredInteger(formData, "onHand", { min: 0 }),
    incoming: requiredInteger(formData, "incoming", { min: 0 }),
    safetyStock: requiredInteger(formData, "safetyStock", { min: 0 }),
    reasonCode,
    reasonNote: optionalString(formData, "reasonNote", { max: 500, label: "Reason note" }) ?? null,
  };
}
