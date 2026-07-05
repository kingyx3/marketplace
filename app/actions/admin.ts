"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";

import {
  adminCatalogProductFromForm,
  adminCatalogSkuFromForm,
  adminInventoryAdjustmentFromForm,
} from "@/lib/admin-catalog-forms";
import { adminOrderActionFromForm } from "@/lib/admin-order-forms";
import { adminPurchaseOrderFromForm } from "@/lib/admin-purchase-order-forms";
import { requireStaff } from "@/lib/auth";
import { performAdminOrderAction } from "@/lib/orders";
import { runPreorderAllocationForSku } from "@/lib/preorders";
import { createServiceClient } from "@/lib/supabase";

export async function updateInventory(formData: FormData) {
  const { user } = await requireStaff("/admin/inventory");
  const input = adminInventoryAdjustmentFromForm(formData);

  const supabase = createServiceClient();
  const { error } = await supabase.rpc("admin_adjust_inventory", {
    p_sku_id: input.skuId,
    p_on_hand: input.onHand,
    p_incoming: input.incoming,
    p_safety_stock: input.safetyStock,
    p_reason_code: input.reasonCode,
    p_reason_note: input.reasonNote,
    p_actor: `staff:${user.id}`,
  });

  if (error) {
    throw new Error(`Inventory adjustment failed: ${error.message}`);
  }

  revalidatePath("/admin/inventory");
  revalidatePath("/admin");
  revalidatePath("/catalog");
}

export async function upsertCatalogProduct(formData: FormData) {
  const { user } = await requireStaff("/admin/catalog");
  const input = adminCatalogProductFromForm(formData);

  const supabase = createServiceClient();
  const { error } = await supabase.rpc("admin_upsert_catalog_product", {
    p_product_id: input.productId,
    p_category_id: input.categoryId,
    p_set_id: input.setId,
    p_slug: input.slug,
    p_name: input.name,
    p_product_type: input.productType,
    p_description: input.description,
    p_language: input.language,
    p_image_url: input.imageUrl,
    p_active: input.active,
    p_actor: `staff:${user.id}`,
  });

  if (error) {
    throw new Error(`Product save failed: ${error.message}`);
  }

  revalidatePath("/admin");
  revalidatePath("/catalog");
}

export async function setCatalogProductActive(formData: FormData) {
  const { user } = await requireStaff("/admin/catalog");
  const productId = String(formData.get("productId") ?? "");
  const active = String(formData.get("active") ?? "false") === "true";

  const supabase = createServiceClient();
  const { error } = await supabase.rpc("admin_set_product_active", {
    p_product_id: productId,
    p_active: active,
    p_actor: `staff:${user.id}`,
  });

  if (error) {
    throw new Error(`Product ${active ? "restore" : "archive"} failed: ${error.message}`);
  }

  revalidatePath("/admin");
  revalidatePath("/catalog");
}

export async function uploadCatalogProductImage(formData: FormData) {
  const { user } = await requireStaff("/admin/catalog");
  const productId = String(formData.get("productId") ?? "");
  const image = formData.get("image");

  if (!(image instanceof File) || image.size === 0) {
    throw new Error("Product image file is required");
  }
  if (!image.type.startsWith("image/")) {
    throw new Error("Product image must be an image file");
  }

  const supabase = createServiceClient();
  const extension = image.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";
  const path = `${productId}/${randomUUID()}.${extension}`;
  const { error: uploadError } = await supabase.storage
    .from("product-images")
    .upload(path, Buffer.from(await image.arrayBuffer()), {
      contentType: image.type,
      upsert: false,
    });

  if (uploadError) {
    throw new Error(`Product image upload failed: ${uploadError.message}`);
  }

  const { data } = supabase.storage.from("product-images").getPublicUrl(path);
  const { error } = await supabase.rpc("admin_set_product_image", {
    p_product_id: productId,
    p_image_url: data.publicUrl,
    p_actor: `staff:${user.id}`,
  });

  if (error) {
    throw new Error(`Product image assignment failed: ${error.message}`);
  }

  revalidatePath("/admin");
  revalidatePath("/catalog");
}

export async function upsertCatalogSku(formData: FormData) {
  const { user } = await requireStaff("/admin/catalog");
  const input = adminCatalogSkuFromForm(formData);

  const supabase = createServiceClient();
  const { error } = await supabase.rpc("admin_upsert_booster_box_sku", {
    p_sku_id: input.skuId,
    p_product_id: input.productId,
    p_sku: input.sku,
    p_barcode: input.barcode,
    p_packs_per_box: input.packsPerBox,
    p_cards_per_pack: input.cardsPerPack,
    p_msrp_cents: input.msrpCents,
    p_price_cents: input.priceCents,
    p_currency: input.currency,
    p_weight_grams: input.weightGrams,
    p_active: input.active,
    p_actor: `staff:${user.id}`,
  });

  if (error) {
    throw new Error(`SKU save failed: ${error.message}`);
  }

  revalidatePath("/admin");
  revalidatePath("/catalog");
}

export async function setCatalogSkuActive(formData: FormData) {
  const { user } = await requireStaff("/admin/catalog");
  const skuId = String(formData.get("skuId") ?? "");
  const active = String(formData.get("active") ?? "false") === "true";

  const supabase = createServiceClient();
  const { error } = await supabase.rpc("admin_set_booster_box_sku_active", {
    p_sku_id: skuId,
    p_active: active,
    p_actor: `staff:${user.id}`,
  });

  if (error) {
    throw new Error(`SKU ${active ? "restore" : "archive"} failed: ${error.message}`);
  }

  revalidatePath("/admin");
  revalidatePath("/catalog");
}

export async function shipOrder(formData: FormData) {
  const { user } = await requireStaff("/admin/orders");
  const orderId = String(formData.get("orderId") ?? "");
  const carrier = String(formData.get("carrier") ?? "");
  const trackingNumber = String(formData.get("trackingNumber") ?? "");

  const supabase = createServiceClient();
  const { error } = await supabase.rpc("admin_ship_order", {
    p_order_id: orderId,
    p_carrier: carrier,
    p_tracking_number: trackingNumber,
    p_actor: `staff:${user.id}`,
  });

  if (error) {
    throw new Error(`Order shipment failed: ${error.message}`);
  }

  revalidatePath("/admin/orders");
  revalidatePath(`/account/orders/${orderId}`);
}

export async function runAdminOrderAction(formData: FormData) {
  const { user } = await requireStaff("/admin/orders");
  const { orderId, body } = adminOrderActionFromForm(formData);

  await performAdminOrderAction(createServiceClient(), orderId, body, `staff:${user.id}`);

  revalidatePath("/admin");
  revalidatePath("/admin/orders");
  revalidatePath(`/orders/${orderId}`);
}

export async function recordSupplierPurchaseOrder(formData: FormData) {
  const { user } = await requireStaff("/admin/purchase-orders");
  const input = adminPurchaseOrderFromForm(formData);

  const supabase = createServiceClient();
  const { error } = await supabase.rpc("admin_create_supplier_purchase_order", {
    p_supplier_id: input.supplierId,
    p_sku_id: input.skuId,
    p_quantity: input.quantity,
    p_unit_cost_cents: input.unitCostCents,
    p_currency: input.currency,
    p_expected_at: input.expectedAt,
    p_notes: input.notes,
    p_actor: `staff:${user.id}`,
  });

  if (error) {
    throw new Error(`Supplier purchase order intake failed: ${error.message}`);
  }

  revalidatePath("/admin");
  revalidatePath("/catalog");
  revalidatePath("/preorders");
}

export async function approveWholesale(formData: FormData) {
  const { user } = await requireStaff("/admin/wholesale");
  const accountId = String(formData.get("accountId") ?? "");
  const pricingTierId = String(formData.get("pricingTierId") ?? "");

  const supabase = createServiceClient();
  const { error } = await supabase.rpc("admin_review_b2b_account", {
    p_account_id: accountId,
    p_decision: "approved",
    p_pricing_tier_id: pricingTierId,
    p_actor: `staff:${user.id}`,
  });

  if (error) {
    throw new Error(`Wholesale approval failed: ${error.message}`);
  }

  revalidatePath("/admin/wholesale");
  revalidatePath("/admin");
  revalidatePath("/wholesale");
  revalidatePath("/catalog");
}

export async function rejectWholesale(formData: FormData) {
  const { user } = await requireStaff("/admin/wholesale");
  const accountId = String(formData.get("accountId") ?? "");
  const reviewNote = String(formData.get("reviewNote") ?? "");

  const supabase = createServiceClient();
  const { error } = await supabase.rpc("admin_review_b2b_account", {
    p_account_id: accountId,
    p_decision: "rejected",
    p_review_note: reviewNote,
    p_actor: `staff:${user.id}`,
  });

  if (error) {
    throw new Error(`Wholesale rejection failed: ${error.message}`);
  }

  revalidatePath("/admin/wholesale");
  revalidatePath("/admin");
  revalidatePath("/wholesale");
  revalidatePath("/catalog");
}

export async function removeWholesalePricingTier(formData: FormData) {
  const { user } = await requireStaff("/admin/wholesale");
  const customerId = String(formData.get("customerId") ?? "");
  const pricingTierId = String(formData.get("pricingTierId") ?? "");

  const supabase = createServiceClient();
  const { error } = await supabase.rpc("admin_remove_b2b_pricing_tier", {
    p_customer_id: customerId,
    p_pricing_tier_id: pricingTierId,
    p_actor: `staff:${user.id}`,
  });

  if (error) {
    throw new Error(`Wholesale pricing tier removal failed: ${error.message}`);
  }

  revalidatePath("/admin/wholesale");
  revalidatePath("/admin");
  revalidatePath("/wholesale");
  revalidatePath("/catalog");
}

export async function runPreorderAllocation(formData: FormData) {
  const { user } = await requireStaff("/admin/preorders");
  const skuId = String(formData.get("skuId") ?? "");

  const supabase = createServiceClient();
  await runPreorderAllocationForSku(supabase, skuId, `staff:${user.id}`);

  revalidatePath("/admin");
  revalidatePath("/preorders");
  revalidatePath("/catalog");
}
