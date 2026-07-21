"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { adminCatalogProductCreateFromForm } from "@/lib/admin-catalog-forms";
import type { CatalogProductActionState } from "@/lib/catalog-product-action-state";
import { requireControlPermission } from "@/lib/control-access";
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
    "/control/catalog",
  );
  let createdProductId: string | undefined;
  let importedSkuCount = 0;

  try {
    const input = adminCatalogProductCreateFromForm(formData);
    const tcgplayerProductId = positiveInteger(
      formData.get("tcgplayerProductId"),
      "TCGplayer product ID",
    );
    const importedSkus = parseImportedSkus(formData.get("tcgplayerSkus"));
    const { data, error } = await createSecretClient().rpc(
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
        p_tcgplayer_product_id: tcgplayerProductId,
        p_skus: importedSkus,
        p_actor_auth_user_id: user.id,
      },
    );

    if (error) return productError(error);

    const result = (data?.[0] ?? null) as {
      product_id?: string;
      imported_sku_count?: number;
    } | null;
    createdProductId = result?.product_id;
    importedSkuCount = result?.imported_sku_count ?? 0;
    revalidateCatalogPaths(createdProductId);
  } catch (error) {
    return {
      status: "error",
      message: safeError(error),
    };
  }

  if (validProductId(createdProductId ?? "")) {
    redirect(`/control/catalog/products/${createdProductId}`);
  }

  return {
    status: "success",
    message:
      importedSkuCount > 0
        ? `Product created with ${importedSkuCount} imported SKU${importedSkuCount === 1 ? "" : "s"}.`
        : "Product created. TCGplayer did not provide SKU records, so no local SKU was created.",
  };
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
    throw new Error(
      "TCGplayer SKU data could not be read. Look up the product again.",
    );
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
  if (typeof value !== "string")
    throw new Error("Imported SKU text is invalid.");
  const result = value.trim();
  if (!result) return null;
  if (result.length > max)
    throw new Error(`Imported SKU text must be ${max} characters or fewer.`);
  return result;
}

function positiveInteger(value: unknown, label: string): number {
  const parsed = optionalPositiveInteger(value, label);
  if (parsed === null) throw new Error(`${label} is required.`);
  return parsed;
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
      field: "name",
      message: "This display name is already used by another product.",
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
  if (productId) revalidatePath(`/control/catalog/products/${productId}`);
  revalidatePath("/products");
}

function validProductId(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function safeError(error: unknown) {
  return error instanceof Error
    ? error.message
    : "The product and its TCGplayer SKUs could not be created.";
}
