"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  adminCatalogProductCreateFromForm,
  adminCatalogProductFromForm,
} from "@/lib/admin-catalog-forms";
import { requiredBoolean, requiredUuid } from "@/lib/admin-form-values";
import {
  MAX_PRODUCT_IMAGE_BYTES,
  PRODUCT_IMAGE_BUCKET,
  isProductImageContentType,
  productImageExtension,
} from "@/lib/catalog-product-images";
import type { CatalogProductActionState } from "@/lib/catalog-product-action-state";
import { requireControlPermission } from "@/lib/control-access";
import { createSecretClient } from "@/lib/supabase";

export async function createCatalogProduct(
  _previousState: CatalogProductActionState,
  formData: FormData
): Promise<CatalogProductActionState> {
  const { user } = await requireControlPermission("catalog.manage", "/control/catalog");
  let createdProductId: string | undefined;
  let successMessage = "Product created.";

  try {
    const input = adminCatalogProductCreateFromForm(formData);
    const supabase = createSecretClient();

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
      p_product_type: input.productType,
      p_new_product_type_name: input.newProductTypeName,
      p_new_product_type_code: input.newProductTypeCode,
      p_name: input.name,
      p_description: input.description,
      p_language: input.language,
      p_image_url: input.imageUrl,
      p_active: input.active,
      p_actor_auth_user_id: user.id,
    });

    if (error) return catalogProductError(error);

    const result = (data?.[0] ?? null) as {
      product_id?: string;
      category_name?: string;
      category_created?: boolean;
      set_name?: string;
      set_created?: boolean;
      product_type_name?: string;
      product_type_created?: boolean;
      product_slug?: string;
    } | null;
    const messages: string[] = [];

    if (result?.category_created && result.category_name) {
      messages.push(`A new ${result.category_name} category was created.`);
    } else if (!input.categoryId && result?.category_name) {
      messages.push(`The existing ${result.category_name} category was reused.`);
    }

    if (result?.set_created && result.set_name) {
      messages.push(`A new ${result.set_name} set was created.`);
    }

    if (result?.product_type_created && result.product_type_name) {
      messages.push(`${result.product_type_name} was added to the product type list.`);
    }

    if (result?.product_slug) {
      messages.push(`Slug: ${result.product_slug}.`);
    }

    createdProductId = result?.product_id ?? undefined;
    successMessage = ["Product created.", ...messages].join(" ");
    revalidateCatalogPaths(createdProductId);
    revalidatePath("/control/catalog/categories");
    revalidatePath("/control/catalog/sets");
    revalidatePath("/orders");
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
    message: successMessage,
  };
}

export async function upsertCatalogProduct(formData: FormData) {
  const { user } = await requireControlPermission("catalog.manage", "/control/catalog");
  const input = adminCatalogProductFromForm(formData);

  const { error } = await createSecretClient().rpc("admin_update_catalog_product", {
    p_product_id: input.productId,
    p_name: input.name,
    p_category_id: input.categoryId,
    p_set_id: input.setId,
    p_product_type: input.productType,
    p_description: input.description,
    p_language: input.language,
    p_image_url: input.imageUrl,
    p_active: input.active,
    p_reference_code: input.referenceCode,
    p_barcode: input.barcode,
    p_packs_per_box: input.packsPerBox,
    p_cards_per_pack: input.cardsPerPack,
    p_weight_grams: input.weightGrams,
    p_actor_auth_user_id: user.id,
  });

  if (error?.code === "23505") {
    throw new Error(
      "Product save failed: the display name generates a slug already used by another product, or this category, set, type, and language combination already exists"
    );
  }
  if (error) throw new Error(`Product save failed: ${error.message}`);
  revalidateCatalogPaths(input.productId ?? undefined);
}

export async function setCatalogProductActive(formData: FormData) {
  const { user } = await requireControlPermission("catalog.manage", "/control/catalog");
  const productId = requiredUuid(formData, "productId", "productId");
  const active = requiredBoolean(formData, "active");

  const { error } = await createSecretClient().rpc("admin_set_product_active", {
    p_product_id: productId,
    p_active: active,
    p_actor: `staff:${user.id}`,
  });

  if (error) throw new Error(`Product ${active ? "restore" : "archive"} failed: ${error.message}`);
  revalidateCatalogPaths(productId);
}

export async function uploadCatalogProductImage(formData: FormData) {
  const { user } = await requireControlPermission("catalog.manage", "/control/catalog");
  const productId = requiredUuid(formData, "productId", "productId");
  const image = formData.get("image");

  if (!(image instanceof File) || image.size === 0)
    throw new Error("Product image file is required");
  if (image.size > MAX_PRODUCT_IMAGE_BYTES) {
    throw new Error("Product image exceeds the allowed file size");
  }
  if (!isProductImageContentType(image.type)) {
    throw new Error("Product image format is not supported");
  }

  const supabase = createSecretClient();
  const extension = productImageExtension(image.type);
  const path = `${productId}/${randomUUID()}.${extension}`;
  const { error: uploadError } = await supabase.storage
    .from(PRODUCT_IMAGE_BUCKET)
    .upload(path, Buffer.from(await image.arrayBuffer()), {
      contentType: image.type,
      upsert: false,
    });

  if (uploadError) throw new Error(`Product image upload failed: ${uploadError.message}`);

  const { data } = supabase.storage.from(PRODUCT_IMAGE_BUCKET).getPublicUrl(path);
  const { error } = await supabase.rpc("admin_set_product_image", {
    p_product_id: productId,
    p_image_url: data.publicUrl,
    p_actor: `staff:${user.id}`,
  });

  if (error) {
    await supabase.storage.from(PRODUCT_IMAGE_BUCKET).remove([path]);
    throw new Error(`Product image assignment failed: ${error.message}`);
  }
  revalidateCatalogPaths(productId);
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
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function catalogProductError(error: { code?: string; message: string }): CatalogProductActionState {
  const message = error.message.toLowerCase();
  if (message.includes("display name") && message.includes("slug")) {
    return {
      status: "error",
      field: "name",
      message:
        "This display name generates a slug already used by another product. Choose a distinct display name; the other product details are preserved.",
    };
  }
  if (
    message.includes("product already exists") ||
    message.includes("product identity already exists")
  ) {
    return {
      status: "error",
      field: "productIdentity",
      message:
        "A product already exists for this category, set, type, and language. Edit that product or change one of those selections; the other product details are preserved.",
    };
  }
  if (message.includes("product name") || message.includes("name required")) {
    return {
      status: "error",
      field: "name",
      message: error.message,
    };
  }
  if (message.includes("archived product type")) {
    return {
      status: "error",
      field: "productType",
      message:
        "The generated product type belongs to an archived option. Restore that type or use a different name; the other product details are preserved.",
    };
  }
  if (message.includes("product type")) {
    return {
      status: "error",
      field: "productType",
      message: error.message,
    };
  }
  if (message.includes("archived category")) {
    return {
      status: "error",
      field: "categorySlug",
      message:
        "The generated category slug belongs to an archived category. Restore that category or rename the new category; the product details are preserved.",
    };
  }
  if (message.includes("set code already exists")) {
    return {
      status: "error",
      field: "setCode",
      message:
        "A set with the generated code already exists in the selected category. Choose the existing set or rename the new set; the product details are preserved.",
    };
  }
  if (message.includes("archived set")) {
    return {
      status: "error",
      field: "setCode",
      message:
        "The generated set code belongs to an archived set in this category. Restore that set or rename the new set; the product details are preserved.",
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
      field: "productIdentity",
      message:
        "A category, set, type, product identity, or generated product slug is already in use. Select the existing record or change the conflicting value; the other product details are preserved.",
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
