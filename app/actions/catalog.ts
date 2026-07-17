"use server";

import { revalidatePath } from "next/cache";

import { adminCatalogProductCreateFromForm } from "@/lib/admin-catalog-forms";
import { requireControlPermission } from "@/lib/control-access";
import { createServiceClient } from "@/lib/supabase";

export interface CatalogProductActionState {
  status: "idle" | "success" | "error";
  message: string;
  field?: "category" | "categorySlug" | "set" | "setCode" | "productSlug";
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

    const { data, error } = await supabase.rpc("admin_create_catalog_product_hierarchy", {
      p_category_id: input.categoryId,
      p_new_category_slug: input.newCategorySlug,
      p_new_category_name: input.newCategoryName,
      p_new_category_publisher: input.newCategoryPublisher,
      p_set_id: input.setId,
      p_new_set_name: input.newSetName,
      p_new_set_code: input.newSetCode,
      p_new_set_release_date: input.newSetReleaseDate,
      p_new_set_status: input.newSetStatus,
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
      | {
          category_name?: string;
          category_created?: boolean;
          set_name?: string;
          set_created?: boolean;
        }
      | null;
    const messages: string[] = [];

    if (result?.category_created && result.category_name) {
      messages.push(`A new ${result.category_name} category was created.`);
    } else if (!input.categoryId && result?.category_name) {
      messages.push(`The existing ${result.category_name} category was reused.`);
    }

    if (result?.set_created && result.set_name) {
      messages.push(`A new ${result.set_name} set was created.`);
    }

    revalidatePath("/control");
    revalidatePath("/control/catalog");
    revalidatePath("/control/categories");
    revalidatePath("/control/sets");
    revalidatePath("/control/listings");
    revalidatePath("/control/operations");
    revalidatePath("/catalog");
    revalidatePath("/preorders");

    return {
      status: "success",
      message: ["Product created.", ...messages].join(" "),
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
  if (message.includes("set code already exists")) {
    return {
      status: "error",
      field: "setCode",
      message:
        "That set code already exists in the selected category. Choose the existing set or enter a unique code; the product details are preserved.",
    };
  }
  if (message.includes("archived set")) {
    return {
      status: "error",
      field: "setCode",
      message:
        "That set code belongs to an archived set in this category. Restore the set or use a different code; the product details are preserved.",
    };
  }
  if (message.includes("set") && message.includes("category")) {
    return {
      status: "error",
      field: "set",
      message: error.message,
    };
  }
  if (error.code === "23505" || message.includes("duplicate")) {
    return {
      status: "error",
      field: "categorySlug",
      message:
        "A category, set, or product already uses that identifier. Select the existing category or enter a unique slug. For a set conflict, select the existing set or enter a unique code; the product details are preserved.",
    };
  }
  if (message.includes("category")) {
    return {
      status: "error",
      field: "category",
      message: error.message,
    };
  }
  if (message.includes("set")) {
    return {
      status: "error",
      field: "set",
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
