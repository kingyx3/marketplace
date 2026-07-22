"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { adminCatalogProductCreateFromForm } from "@/lib/admin-catalog-forms";
import type { CatalogProductActionState } from "@/lib/catalog-product-action-state";
import { requireControlPermission } from "@/lib/control-access";
import type { TcgplayerProductImportDraft } from "@/lib/tcgplayer-product-import";
import { createSecretClient } from "@/lib/supabase";

const REFERENCE_PATTERN = /^[A-Z0-9][A-Z0-9._-]{0,63}$/;
const MAX_IMPORTED_PRODUCTS = 50;
const MAX_IMPORT_PAYLOAD_BYTES = 100_000;

export async function createTcgplayerCatalogProduct(
  _previousState: CatalogProductActionState,
  formData: FormData,
): Promise<CatalogProductActionState> {
  const { user } = await requireControlPermission(
    "catalog.manage",
    "/control/catalog",
  );
  let importId: string | undefined;

  try {
    const input = adminCatalogProductCreateFromForm(formData);
    const tcgplayerProductId = positiveInteger(
      formData.get("tcgplayerProductId"),
      "TCGplayer product ID",
    );
    const importedProducts = parseImportedProducts(formData.get("tcgplayerProducts"));
    const { data, error } = await createSecretClient().rpc(
      "admin_import_tcgplayer_products",
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
        p_products: importedProducts,
        p_actor_auth_user_id: user.id,
      },
    );

    if (error) return productError(error);

    const result = (data?.[0] ?? null) as {
      import_id?: string;
    } | null;
    importId = result?.import_id;
    revalidateCatalogPaths();
  } catch (error) {
    return {
      status: "error",
      message: safeError(error),
    };
  }

  if (validProductId(importId ?? "")) {
    redirect(`/control/catalog/imports/${importId}`);
  }

  return {
    status: "success",
    message: "Products created. Open the import confirmation to review each product.",
  };
}

function parseImportedProducts(
  value: FormDataEntryValue | null,
): TcgplayerProductImportDraft[] {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error("At least one product is required.");
  }
  if (new TextEncoder().encode(value).byteLength > MAX_IMPORT_PAYLOAD_BYTES) {
    throw new Error("TCGplayer product data is too large to import safely.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(value) as unknown;
  } catch {
    throw new Error(
      "TCGplayer product data could not be read. Look up the product again.",
    );
  }

  if (!Array.isArray(parsed)) {
    throw new Error("TCGplayer product data must be a list.");
  }
  if (parsed.length === 0 || parsed.length > MAX_IMPORTED_PRODUCTS) {
    throw new Error(
      `Between 1 and ${MAX_IMPORTED_PRODUCTS} products can be imported at once.`,
    );
  }

  return parsed.map((entry, index) => {
    const record = objectValue(entry, `TCGplayer product ${index + 1}`);
    const referenceCode = requiredString(
      record.referenceCode,
      `Product ${index + 1} reference`,
      64,
    ).toUpperCase();
    if (!REFERENCE_PATTERN.test(referenceCode)) {
      throw new Error(
        `Product ${index + 1} reference may use only letters, numbers, dots, hyphens, and underscores.`,
      );
    }

    return {
      sourceVariantId: optionalPositiveInteger(
        record.sourceVariantId,
        `TCGplayer product ${index + 1} source variant ID`,
      ),
      sourceProductConditionId: optionalPositiveInteger(
        record.sourceProductConditionId,
        `TCGplayer variant ${index + 1} product condition ID`,
      ),
      sourceConditionId: optionalPositiveInteger(
        record.sourceConditionId,
        `TCGplayer variant ${index + 1} condition ID`,
      ),
      sourceLanguageId: optionalPositiveInteger(
        record.sourceLanguageId,
        `TCGplayer variant ${index + 1} language ID`,
      ),
      sourcePrintingId: optionalPositiveInteger(
        record.sourcePrintingId,
        `TCGplayer variant ${index + 1} printing ID`,
      ),
      sourceProviderVariantId: optionalPositiveInteger(
        record.sourceProviderVariantId,
        `TCGplayer variant ${index + 1} variant ID`,
      ),
      condition: optionalString(record.condition, 160),
      language: optionalString(record.language, 80),
      printing: optionalString(record.printing, 160),
      marketPriceUsd: optionalNonNegativeNumber(record.marketPriceUsd),
      lowPriceUsd: optionalNonNegativeNumber(record.lowPriceUsd),
      midPriceUsd: optionalNonNegativeNumber(record.midPriceUsd),
      highPriceUsd: optionalNonNegativeNumber(record.highPriceUsd),
      directLowPriceUsd: optionalNonNegativeNumber(record.directLowPriceUsd),
      name: requiredString(record.name, `Product ${index + 1} name`, 160),
      referenceCode,
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
    throw new Error("Imported product text is invalid.");
  const result = value.trim();
  if (!result) return null;
  if (result.length > max)
    throw new Error(`Imported product text must be ${max} characters or fewer.`);
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
        "One of the imported barcodes is already assigned to another product.",
    };
  }
  if (
    message.includes("reference") &&
    (error.code === "23505" || message.includes("duplicate"))
  ) {
    return {
      status: "error",
      message:
        "One of the imported product references is already assigned to another product.",
    };
  }
  return {
    status: "error",
    message:
      error.message ||
      "The TCGplayer products could not be created.",
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
    : "The product and its TCGplayer variants could not be created.";
}
