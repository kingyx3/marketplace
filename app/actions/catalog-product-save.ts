"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";

import { adminCatalogProductFromForm } from "@/lib/admin-catalog-forms";
import type { CatalogProductActionState } from "@/lib/catalog-product-action-state";
import { requireControlPermission } from "@/lib/control-access";
import { logError, logWarn } from "@/lib/observability";
import { createSecretClient } from "@/lib/supabase";

export async function saveCatalogProduct(
  _previousState: CatalogProductActionState,
  formData: FormData
): Promise<CatalogProductActionState> {
  const { user } = await requireControlPermission("catalog.manage", "/control/catalog");
  const productId = String(formData.get("productId") ?? "");
  const context = {
    route: validProductId(productId)
      ? `/control/catalog/products/${productId}`
      : "/control/catalog",
    userId: user.id,
    productId,
  };

  try {
    const input = adminCatalogProductFromForm(formData);
    const { error } = await createSecretClient().rpc("admin_upsert_catalog_product", {
      p_product_id: input.productId,
      p_name: input.name,
      p_category_id: input.categoryId,
      p_set_id: input.setId,
      p_product_type: input.productType,
      p_description: input.description,
      p_language: input.language,
      p_image_url: input.imageUrl,
      p_active: input.active,
      p_actor: `staff:${user.id}`,
    });

    if (error) {
      const state = productSaveError(error);
      if (error.code === "23505" || error.code === "22023" || error.code === "P0002") {
        logWarn("catalog.product_save_rejected", {
          ...context,
          errorCode: error.code,
          reason: state.message,
        });
      } else {
        logError("catalog.product_save_failed", error, context);
      }
      return state;
    }

    revalidateCatalogPaths(input.productId ?? undefined);
    return {
      status: "success",
      message: "Product details saved. Pricing and storefront publication remain unchanged.",
    };
  } catch (error) {
    const requestId = randomUUID();
    logError("catalog.product_save_failed", error, { ...context, requestId });

    if (error instanceof Error && isActionableValidationMessage(error.message)) {
      return { status: "error", message: error.message };
    }

    return {
      status: "error",
      message: `Product could not be saved. Error reference: ${requestId}`,
    };
  }
}

function productSaveError(error: { code?: string; message: string }): CatalogProductActionState {
  const message = error.message.toLowerCase();

  if (message.includes("display name") && message.includes("slug")) {
    return {
      status: "error",
      field: "name",
      message:
        "This display name generates a slug already used by another product. Choose a distinct display name.",
    };
  }

  if (message.includes("product already exists") || message.includes("product identity")) {
    return {
      status: "error",
      field: "productIdentity",
      message:
        "A product already exists for this category, set, type, and language. Edit that product or change one of those selections.",
    };
  }

  if (
    error.code === "22023" ||
    error.code === "P0002" ||
    message.includes("required") ||
    message.includes("invalid") ||
    message.includes("not found")
  ) {
    return { status: "error", message: error.message };
  }

  const requestId = randomUUID();
  logError("catalog.product_save_failed", error, { requestId, errorCode: error.code });
  return {
    status: "error",
    message: `Product could not be saved. Error reference: ${requestId}`,
  };
}

function isActionableValidationMessage(message: string): boolean {
  return /required|invalid|not found|already exists|must be|select /i.test(message);
}

function validProductId(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function revalidateCatalogPaths(productId?: string): void {
  revalidatePath("/control");
  revalidatePath("/control/catalog");
  revalidatePath("/control/pricing");
  revalidatePath("/control/storefront/listings");
  if (productId) revalidatePath(`/control/catalog/products/${productId}`);
  revalidatePath("/products");
}
