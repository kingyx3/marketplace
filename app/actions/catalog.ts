"use server";

import { revalidatePath } from "next/cache";

import { adminCatalogProductCreateFromForm } from "@/lib/admin-catalog-forms";
import { requireControlPermission } from "@/lib/control-access";
import { createServiceClient } from "@/lib/supabase";

export interface CatalogProductActionState {
  status: "idle" | "success" | "error";
  message: string;
  field?: "category" | "categorySlug" | "productSlug";
}

export const initialCatalogProductActionState: CatalogProductActionState = {
  status: "idle",
  message: "",
};

export async function createCatalogProduct(
  _previousState: CatalogProductActionState,
  formData: FormData
): Promise<CatalogProductActionState> {
  const { user } = await requireControlPermission("manage_catalog", "/control/catalog");

  try {
    const input = adminCatalogProductCreateFromForm(formData);
    const supabase = createServiceClient();

    const { data, error } = await supabase.rpc("admin_create_catalog_product_with_category", {
      p_category_id: input.categoryId,
      p_new_category_slug: input.newCategorySlug,
      p_new_category_name: input.newCategoryName,
      p_new_category_publisher: input.newCategoryPublisher,
      p_set_id: input.setId,
      p_slug: input.slug,
      p_name: input.name,
      p_product_type: input.productType,
      p_description: input.description,
      p_language: input.language,
      p_image_url: input.imageUrl,
      p_active: input.active,
      p_actor_auth_user_id: user.id,
    });

    if (error) return catalogProductError(error);

    const result = (data?.[0] ?? null) as
      | { category_name?: string; category_created?: boolean }
      | null;
    const categoryName = result?.category_name ?? "the selected category";
    const categoryMessage = result?.category_created
      ? ` A new ${categoryName} category was created.`
      : input.categoryId
        ? ""
        : ` The existing ${categoryName} category was reused.`;

    revalidatePath("/control");
    revalidatePath("/control/catalog");
    revalidatePath("/control/categories");
    revalidatePath("/control/sets");
    revalidatePath("/control/listings");
    revalidatePath("/control/operations");
    revalidatePath("/catalog");

    return {
      status: "success",
      message: `Product created.${categoryMessage}`,
    };
  } catch (error) {
    return {
      status: "error",
      message: safeError(error),
    };
  }
}

function catalogProductError(error: { code?: string; message: string }): CatalogProductActionState {
  const message = error.message.toLowerCase();
  if (message.includes("product slug already exists")) {
    return {
      status: "error",
      field: "productSlug",
      message:
        "That product slug is already in use. Change the slug and submit again; the other product details are preserved.",
    };
  }
  if (message.includes("archived category")) {
    return {
      status: "error",
      field: "categorySlug",
      message:
        "That category slug belongs to an archived category. Restore the category or use a different slug; the product details are preserved.",
    };
  }
  if (error.code === "23505" || message.includes("duplicate")) {
    return {
      status: "error",
      field: "categorySlug",
      message:
        "A category or product already uses that slug. Select the existing category or enter a unique slug; the product details are preserved.",
    };
  }
  if (message.includes("category")) {
    return {
      status: "error",
      field: "category",
      message: error.message,
    };
  }
  return {
    status: "error",
    message: `Product could not be created: ${error.message}`,
  };
}

function safeError(error: unknown): string {
  return error instanceof Error ? error.message : "Product could not be created";
}
