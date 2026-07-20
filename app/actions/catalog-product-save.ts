"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";

import { adminCatalogProductFromForm } from "@/lib/admin-catalog-forms";
import type { CatalogProductActionState } from "@/lib/catalog-product-action-state";
import { requireControlPermission } from "@/lib/control-access";
import { logError, logWarn } from "@/lib/observability";
import { createServiceClient } from "@/lib/supabase";

export async function saveCatalogProduct(
  _previousState: CatalogProductActionState,
  formData: FormData
): Promise<CatalogProductActionState> {
  const { user } = await requireControlPermission("manage_catalog", "/control/operations");
  const productId = String(formData.get("productId") ?? "");
  const published = booleanFormValue(formData, "published", true);
  const context = {
    route: validProductId(productId)
      ? `/control/operations/products/${productId}`
      : "/control/operations",
    userId: user.id,
    productId,
    published,
  };

  try {
    const input = adminCatalogProductFromForm(formData);
    const { error } = await createServiceClient().rpc(
      "admin_upsert_catalog_product_with_publication",
      {
        p_product_id: input.productId,
        p_name: input.name,
        p_category_id: input.categoryId,
        p_set_id: input.setId,
        p_product_type: input.productType,
        p_description: input.description,
        p_language: input.language,
        p_image_url: input.imageUrl,
        p_active: input.active,
        p_published: published,
        p_actor: `staff:${user.id}`,
      }
    );

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
      message: published
        ? "Product saved. Publication is enabled. Storefront visibility also requires an active product and an active SKU with a positive price."
        : "Product saved as not published.",
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

  if (message.includes("product_id") && message.includes("ambiguous")) {
    return {
      status: "error",
      message:
        "Product publication could not be saved because the database publication function is outdated. Deploy the latest migration and try again.",
    };
  }

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

function booleanFormValue(formData: FormData, key: string, defaultValue: boolean): boolean {
  const values = formData.getAll(key);
  const selected = [...values].reverse().find((value): value is string => typeof value === "string");
  if (selected === undefined) return defaultValue;
  return selected === "true";
}

function validProductId(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

function revalidateCatalogPaths(productId?: string): void {
  revalidatePath("/control");
  revalidatePath("/control/operations");
  revalidatePath("/control/listings");
  if (productId) revalidatePath(`/control/operations/products/${productId}`);
  revalidatePath("/products");
}
