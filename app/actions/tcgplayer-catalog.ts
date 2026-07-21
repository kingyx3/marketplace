"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { adminCatalogProductCreateFromForm } from "@/lib/admin-catalog-forms";
import type { CatalogProductActionState } from "@/lib/catalog-product-action-state";
import { requireControlPermission } from "@/lib/control-access";
import {
  fetchControlCategories,
  fetchControlProductTypes,
  fetchControlSets,
} from "@/lib/control-catalog";
import { enforceRateLimit } from "@/lib/api/rate-limit";
import {
  fetchTcgplayerCatalogSuggestion,
  TcgplayerCatalogError,
} from "@/lib/tcgplayer-catalog";
import {
  buildTcgplayerCatalogImportPlan,
  type TcgplayerCatalogImportPlan,
} from "@/lib/tcgplayer-catalog-import-plan";
import type { TcgplayerSkuImportDraft } from "@/lib/tcgplayer-sku-import";
import { createSecretClient } from "@/lib/supabase";

const SKU_PATTERN = /^[A-Z0-9][A-Z0-9._-]{0,63}$/;
const MAX_IMPORTED_SKUS = 50;
const MAX_IMPORT_PAYLOAD_BYTES = 100_000;

export async function createTcgplayerCatalogProduct(
  _previousState: CatalogProductActionState,
  formData: FormData,
): Promise<CatalogProductActionState> {
  const { user } = await requireControlPermission(
    "catalog.manage",
    "/control/catalog/products/new",
  );
  let createdProductId: string | undefined;

  try {
    const reference = requiredReference(formData.get("tcgplayerReference"));
    const supabase = createSecretClient();
    await enforceRateLimit(supabase, {
      scope: "admin.tcgplayer_catalog_import",
      identifier: user.id,
      limit: 12,
      windowSeconds: 60,
    });

    const [suggestion, categories, sets, productTypes] = await Promise.all([
      fetchTcgplayerCatalogSuggestion(reference),
      fetchControlCategories(supabase),
      fetchControlSets(supabase),
      fetchControlProductTypes(supabase),
    ]);
    const plan = buildTcgplayerCatalogImportPlan(
      suggestion,
      categories,
      sets,
      productTypes,
    );
    const input = adminCatalogProductCreateFromForm(importPlanFormData(plan));
    const importedSkus = parseImportedSkus(JSON.stringify(plan.skus));
    const { data, error } = await supabase.rpc(
      "admin_create_tcgplayer_catalog_product",
      {
        p_category_id: input.categoryId,
        p_new_category_slug: input.newCategorySlug,
        p_new_category_name: input.newCategoryName,
        p_new_category_publisher: input.newCategoryPublisher,
        p_set_id: input.setId,
        p_new_set_name: input.newSetName,
        p_new_set_code: input.newSetCode,
        p_new_set_release_date: input.newSetReleaseDate,
        p_new_set_status: input.newSetStatus,
        p_product_type: input.productType,
        p_new_product_type_name: input.newProductTypeName,
        p_new_product_type_code: input.newProductTypeCode,
        p_name: input.name,
        p_description: input.description,
        p_language: input.language,
        p_image_url: input.imageUrl,
        p_active: input.active,
        p_tcgplayer_product_id: suggestion.productId,
        p_skus: importedSkus,
        p_actor_auth_user_id: user.id,
      },
    );

    if (error) return productError(error);

    const result = (data?.[0] ?? null) as {
      product_id?: string;
    } | null;
    createdProductId = result?.product_id;
    revalidateCatalogPaths(createdProductId);
  } catch (error) {
    return {
      status: "error",
      message: safeError(error),
    };
  }

  if (validProductId(createdProductId ?? "")) {
    redirect(
      `/control/catalog/products/${createdProductId}/import-complete`,
    );
  }

  return {
    status: "error",
    message:
      "The import completed without returning a product ID. Open Catalog and verify the created record.",
  };
}

function importPlanFormData(plan: TcgplayerCatalogImportPlan): FormData {
  const formData = new FormData();
  formData.set("name", plan.product.name);
  formData.set("description", plan.product.description ?? "");
  formData.set("language", plan.product.language);
  formData.set("imageUrl", plan.product.imageUrl ?? "");
  formData.set("active", "true");

  if (plan.category.id) {
    formData.set("categoryMode", "existing");
    formData.set("categoryId", plan.category.id);
  } else {
    formData.set("categoryMode", "new");
    formData.set("newCategoryName", plan.category.name);
    formData.set("newCategoryPublisher", plan.category.publisher ?? "");
  }

  if (plan.set.id) {
    formData.set("setMode", "existing");
    formData.set("setId", plan.set.id);
  } else {
    formData.set("setMode", "new");
    formData.set("newSetName", plan.set.name);
    formData.set("newSetReleaseDate", plan.set.releaseDate ?? "");
    formData.set("newSetStatus", "announced");
  }

  if (plan.productType.code) {
    formData.set("productTypeMode", "existing");
    formData.set("productType", plan.productType.code);
  } else {
    formData.set("productTypeMode", "new");
    formData.set("newProductTypeName", plan.productType.name);
  }

  return formData;
}

function requiredReference(value: FormDataEntryValue | null): string {
  if (typeof value !== "string") {
    throw new Error("Enter a TCGplayer product URL or numeric product ID.");
  }
  const reference = value.trim();
  if (!reference || reference.length > 300) {
    throw new Error("Enter a TCGplayer product URL or numeric product ID.");
  }
  return reference;
}

function parseImportedSkus(
  value: FormDataEntryValue | null,
): TcgplayerSkuImportDraft[] {
  if (typeof value !== "string" || value.trim() === "") return [];
  if (new TextEncoder().encode(value).byteLength > MAX_IMPORT_PAYLOAD_BYTES) {
    throw new Error("TCGplayer SKU data is too large to import safely.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(value) as unknown;
  } catch {
    throw new Error("TCGplayer SKU data could not be read. Try the import again.");
  }

  if (!Array.isArray(parsed)) {
    throw new Error("TCGplayer SKU data must be a list.");
  }
  if (parsed.length > MAX_IMPORTED_SKUS) {
    throw new Error(
      `A maximum of ${MAX_IMPORTED_SKUS} TCGplayer SKUs can be imported at once.`,
    );
  }

  return parsed.map((entry, index) => {
    const record = objectValue(entry, `TCGplayer SKU ${index + 1}`);
    const sku = requiredString(
      record.sku,
      `TCGplayer SKU ${index + 1} code`,
      64,
    ).toUpperCase();
    if (!SKU_PATTERN.test(sku)) {
      throw new Error(
        `TCGplayer SKU ${index + 1} code may use only letters, numbers, dots, hyphens, and underscores.`,
      );
    }

    return {
      sourceSkuId: optionalPositiveInteger(
        record.sourceSkuId,
        `TCGplayer SKU ${index + 1} source ID`,
      ),
      sourceProductConditionId: optionalPositiveInteger(
        record.sourceProductConditionId,
        `TCGplayer SKU ${index + 1} product condition ID`,
      ),
      sourceConditionId: optionalPositiveInteger(
        record.sourceConditionId,
        `TCGplayer SKU ${index + 1} condition ID`,
      ),
      sourceLanguageId: optionalPositiveInteger(
        record.sourceLanguageId,
        `TCGplayer SKU ${index + 1} language ID`,
      ),
      sourcePrintingId: optionalPositiveInteger(
        record.sourcePrintingId,
        `TCGplayer SKU ${index + 1} printing ID`,
      ),
      sourceVariantId: optionalPositiveInteger(
        record.sourceVariantId,
        `TCGplayer SKU ${index + 1} variant ID`,
      ),
      condition: optionalString(record.condition, 160),
      language: optionalString(record.language, 80),
      printing: optionalString(record.printing, 160),
      marketPriceUsd: optionalNonNegativeNumber(record.marketPriceUsd),
      lowPriceUsd: optionalNonNegativeNumber(record.lowPriceUsd),
      midPriceUsd: optionalNonNegativeNumber(record.midPriceUsd),
      highPriceUsd: optionalNonNegativeNumber(record.highPriceUsd),
      directLowPriceUsd: optionalNonNegativeNumber(record.directLowPriceUsd),
      sku,
      barcode: optionalString(record.barcode, 64),
      packsPerBox: optionalPositiveInteger(record.packsPerBox, "Packs per box"),
      cardsPerPack: optionalPositiveInteger(
        record.cardsPerPack,
        "Cards per pack",
      ),
      weightGrams: optionalPositiveInteger(record.weightGrams, "Weight grams"),
      active: record.active !== false,
    };
  });
}

function objectValue(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} is invalid.`);
  }
  return value as Record<string, unknown>;
}

function requiredString(value: unknown, label: string, max: number): string {
  const result = optionalString(value, max);
  if (!result) throw new Error(`${label} is required.`);
  return result;
}

function optionalString(value: unknown, max: number): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") {
    throw new Error("Imported SKU text is invalid.");
  }
  const result = value.trim();
  if (!result) return null;
  if (result.length > max) {
    throw new Error(`Imported SKU text must be ${max} characters or fewer.`);
  }
  return result;
}

function optionalPositiveInteger(value: unknown, label: string): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive whole number.`);
  }
  return parsed;
}

function optionalNonNegativeNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error("Imported TCGplayer price data is invalid.");
  }
  return parsed;
}

function productError(error: {
  code?: string;
  message: string;
}): CatalogProductActionState {
  const message = error.message.toLowerCase();
  if (message.includes("display name") && message.includes("slug")) {
    return {
      status: "error",
      message:
        "A product with this TCGplayer name already exists. Open Catalog to review the existing product.",
    };
  }
  if (
    message.includes("barcode") &&
    (error.code === "23505" || message.includes("duplicate"))
  ) {
    return {
      status: "error",
      message:
        "One of the imported barcodes is already assigned to another SKU.",
    };
  }
  if (
    message.includes("sku") &&
    (error.code === "23505" || message.includes("duplicate"))
  ) {
    return {
      status: "error",
      message:
        "One of the imported TCGplayer SKU codes is already assigned to another product.",
    };
  }
  return {
    status: "error",
    message:
      error.message ||
      "The product and its TCGplayer SKUs could not be created.",
  };
}

function revalidateCatalogPaths(productId?: string) {
  revalidatePath("/control");
  revalidatePath("/control/catalog");
  revalidatePath("/control/pricing");
  revalidatePath("/control/storefront");
  revalidatePath("/control/storefront/listings");
  if (productId) {
    revalidatePath(`/control/catalog/products/${productId}`);
    revalidatePath(
      `/control/catalog/products/${productId}/import-complete`,
    );
  }
  revalidatePath("/products");
}

function validProductId(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function safeError(error: unknown) {
  if (error instanceof TcgplayerCatalogError) return error.message;
  return error instanceof Error
    ? error.message
    : "The product and its TCGplayer SKUs could not be created.";
}
