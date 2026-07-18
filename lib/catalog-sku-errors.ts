export const catalogSkuErrorCodes = [
  "positive-price",
  "duplicate-sku",
  "duplicate-barcode",
  "currency",
  "product-not-found",
  "sku-required",
  "save-failed",
] as const;

export type CatalogSkuErrorCode = (typeof catalogSkuErrorCodes)[number];

export function catalogSkuErrorCode(error: unknown): CatalogSkuErrorCode {
  const { code, message } = errorDetails(error);
  const normalized = message.toLowerCase();

  if (
    code === "23514" ||
    normalized.includes("pricecents") ||
    normalized.includes("price_cents") ||
    normalized.includes("price must be positive") ||
    normalized.includes("positive price")
  ) {
    return "positive-price";
  }

  if (normalized.includes("currency")) return "currency";
  if (normalized.includes("product not found")) return "product-not-found";
  if (normalized.includes("sku is required") || normalized.includes("sku required")) {
    return "sku-required";
  }

  if (code === "23505" || normalized.includes("duplicate key")) {
    return normalized.includes("barcode") ? "duplicate-barcode" : "duplicate-sku";
  }

  return "save-failed";
}

export function catalogSkuErrorMessage(code: string | undefined): string {
  switch (code) {
    case "positive-price":
      return "Enter a selling price greater than 0 cents. Zero-priced SKUs cannot be created or shown on the storefront.";
    case "duplicate-sku":
      return "That SKU code already exists. Use the existing SKU or enter a unique SKU code.";
    case "duplicate-barcode":
      return "That barcode is already assigned to another SKU. Use the existing SKU or enter a unique barcode.";
    case "currency":
      return "Currency must be a valid three-letter code such as SGD, USD, or JPY.";
    case "product-not-found":
      return "The selected product no longer exists. Return to Operations, refresh the product list, and try again.";
    case "sku-required":
      return "Enter a SKU code before saving.";
    default:
      return "The SKU could not be saved. Review the selected product, SKU code, barcode, price, and currency, then try again.";
  }
}

function errorDetails(error: unknown): { code?: string; message: string } {
  if (error instanceof Error) {
    return {
      code:
        "code" in error && typeof (error as { code?: unknown }).code === "string"
          ? (error as { code: string }).code
          : undefined,
      message: error.message,
    };
  }

  if (error && typeof error === "object") {
    const record = error as { code?: unknown; message?: unknown };
    return {
      code: typeof record.code === "string" ? record.code : undefined,
      message: typeof record.message === "string" ? record.message : "",
    };
  }

  return { message: typeof error === "string" ? error : "" };
}
