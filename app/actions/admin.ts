"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";

import {
  adminCatalogProductFromForm,
  adminCatalogSkuFromForm,
  adminInventoryAdjustmentFromForm,
} from "@/lib/admin-catalog-forms";
import {
  adminLimitedTimeDealFromForm,
  adminLimitedTimeDealStatusFromForm,
  adminListingItemFromForm,
  adminStorefrontConfigurationFromForm,
} from "@/lib/admin-listing-forms";
import { adminOrderActionFromForm } from "@/lib/admin-order-forms";
import { adminPurchaseOrderFromForm } from "@/lib/admin-purchase-order-forms";
import { requireControlPermission } from "@/lib/control-access";
import { performAdminOrderAction } from "@/lib/orders";
import { runPreorderAllocationForSku } from "@/lib/preorders";
import { createServiceClient } from "@/lib/supabase";

export async function upsertLimitedTimeDeal(formData: FormData) {
  const { user } = await requireControlPermission("manage_catalog", "/control/deals");
  const input = adminLimitedTimeDealFromForm(formData);

  const { error } = await createServiceClient().rpc("admin_upsert_limited_time_deal", {
    p_deal_id: input.dealId,
    p_code: input.code,
    p_sku_id: input.skuId,
    p_title: input.title,
    p_description: input.description,
    p_discount_bps: input.discountBps,
    p_visibility: input.visibility,
    p_starts_at: input.startsAt,
    p_ends_at: input.endsAt,
    p_sort_priority: input.sortPriority,
    p_active: input.active,
    p_actor: `staff:${user.id}`,
  });

  if (error) throw new Error(`Limited-time deal save failed: ${error.message}`);

  revalidateDealPaths();
}

export async function setLimitedTimeDealActive(formData: FormData) {
  const { user } = await requireControlPermission("manage_catalog", "/control/deals");
  const input = adminLimitedTimeDealStatusFromForm(formData);

  const { error } = await createServiceClient().rpc("admin_set_limited_time_deal_active", {
    p_deal_id: input.dealId,
    p_active: input.active,
    p_actor: `staff:${user.id}`,
  });

  if (error) throw new Error(`Limited-time deal status update failed: ${error.message}`);

  revalidateDealPaths();
}

function revalidateDealPaths() {
  revalidatePath("/");
  revalidatePath("/control/deals");
  revalidatePath("/catalog");
}

export async function upsertListingItem(formData: FormData) {
  const { user } = await requireControlPermission("manage_catalog", "/control/listings");
  const input = adminListingItemFromForm(formData);

  const { error } = await createServiceClient().rpc("admin_upsert_listing_item", {
    p_product_id: input.productId,
    p_title_override: input.titleOverride,
    p_badge_label: input.badgeLabel,
    p_tags: input.tags,
    p_channels: input.channels,
    p_max_per_customer: input.maxPerCustomer,
    p_preorder_reserve: input.preorderReserve,
    p_sort_priority: input.sortPriority,
    p_featured: input.featured,
    p_published: input.published,
    p_actor: `staff:${user.id}`,
  });

  if (error) throw new Error(`Listing item save failed: ${error.message}`);

  revalidatePath("/control");
  revalidatePath("/control/operations");
  revalidatePath("/control/listings");
  revalidatePath("/catalog");
}

export async function upsertStorefrontConfiguration(formData: FormData) {
  const { user } = await requireControlPermission("manage_catalog", "/control/listings");
  const input = adminStorefrontConfigurationFromForm(formData);

  const { error } = await createServiceClient().rpc("admin_upsert_storefront_configuration", {
    p_key: input.key,
    p_label: input.label,
    p_description: input.description,
    p_value: input.value,
    p_active: input.active,
    p_actor: `staff:${user.id}`,
  });

  if (error) throw new Error(`Storefront configuration save failed: ${error.message}`);

  revalidatePath("/control");
  revalidatePath("/control/listings");
  revalidatePath("/catalog");
}

export async function updateInventory(formData: FormData) {
  const { user } = await requireControlPermission("manage_full_operations", "/control/operations");
  const input = adminInventoryAdjustmentFromForm(formData);

  const { error } = await createServiceClient().rpc("admin_adjust_inventory", {
    p_sku_id: input.skuId,
    p_on_hand: input.onHand,
    p_incoming: input.incoming,
    p_safety_stock: input.safetyStock,
    p_reason_code: input.reasonCode,
    p_reason_note: input.reasonNote,
    p_actor: `staff:${user.id}`,
  });

  if (error) throw new Error(`Inventory adjustment failed: ${error.message}`);

  revalidatePath("/control/operations");
  revalidatePath("/control");
  revalidatePath("/catalog");
}

export async function upsertCatalogProduct(formData: FormData) {
  const { user } = await requireControlPermission("manage_full_operations", "/control/operations");
  const input = adminCatalogProductFromForm(formData);

  const { error } = await createServiceClient().rpc("admin_upsert_catalog_product", {
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

  if (error) throw new Error(`Product save failed: ${error.message}`);

  revalidatePath("/control");
  revalidatePath("/control/operations");
  revalidatePath("/catalog");
}

export async function setCatalogProductActive(formData: FormData) {
  const { user } = await requireControlPermission("manage_full_operations", "/control/operations");
  const productId = String(formData.get("productId") ?? "");
  const active = String(formData.get("active") ?? "false") === "true";

  const { error } = await createServiceClient().rpc("admin_set_product_active", {
    p_product_id: productId,
    p_active: active,
    p_actor: `staff:${user.id}`,
  });

  if (error) throw new Error(`Product ${active ? "restore" : "archive"} failed: ${error.message}`);

  revalidatePath("/control");
  revalidatePath("/control/operations");
  revalidatePath("/catalog");
}

export async function uploadCatalogProductImage(formData: FormData) {
  const { user } = await requireControlPermission("manage_full_operations", "/control/operations");
  const productId = String(formData.get("productId") ?? "");
  const image = formData.get("image");

  if (!(image instanceof File) || image.size === 0) throw new Error("Product image file is required");
  if (!image.type.startsWith("image/")) throw new Error("Product image must be an image file");

  const supabase = createServiceClient();
  const extension = image.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";
  const path = `${productId}/${randomUUID()}.${extension}`;
  const { error: uploadError } = await supabase.storage
    .from("product-images")
    .upload(path, Buffer.from(await image.arrayBuffer()), {
      contentType: image.type,
      upsert: false,
    });

  if (uploadError) throw new Error(`Product image upload failed: ${uploadError.message}`);

  const { data } = supabase.storage.from("product-images").getPublicUrl(path);
  const { error } = await supabase.rpc("admin_set_product_image", {
    p_product_id: productId,
    p_image_url: data.publicUrl,
    p_actor: `staff:${user.id}`,
  });

  if (error) throw new Error(`Product image assignment failed: ${error.message}`);

  revalidatePath("/control");
  revalidatePath("/control/operations");
  revalidatePath("/catalog");
}

export async function upsertCatalogSku(formData: FormData) {
  const { user } = await requireControlPermission("manage_full_operations", "/control/operations");
  const input = adminCatalogSkuFromForm(formData);

  const { error } = await createServiceClient().rpc("admin_upsert_booster_box_sku", {
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

  if (error) throw new Error(`SKU save failed: ${error.message}`);

  revalidatePath("/control");
  revalidatePath("/control/operations");
  revalidatePath("/catalog");
}

export async function setCatalogSkuActive(formData: FormData) {
  const { user } = await requireControlPermission("manage_full_operations", "/control/operations");
  const skuId = String(formData.get("skuId") ?? "");
  const active = String(formData.get("active") ?? "false") === "true";

  const { error } = await createServiceClient().rpc("admin_set_booster_box_sku_active", {
    p_sku_id: skuId,
    p_active: active,
    p_actor: `staff:${user.id}`,
  });

  if (error) throw new Error(`SKU ${active ? "restore" : "archive"} failed: ${error.message}`);

  revalidatePath("/control");
  revalidatePath("/control/operations");
  revalidatePath("/catalog");
}

export async function shipOrder(formData: FormData) {
  const { user } = await requireControlPermission("manage_full_operations", "/control/operations");
  const orderId = String(formData.get("orderId") ?? "");
  const carrier = String(formData.get("carrier") ?? "");
  const trackingNumber = String(formData.get("trackingNumber") ?? "");

  const { error } = await createServiceClient().rpc("admin_ship_order", {
    p_order_id: orderId,
    p_carrier: carrier,
    p_tracking_number: trackingNumber,
    p_actor: `staff:${user.id}`,
  });

  if (error) throw new Error(`Order shipment failed: ${error.message}`);

  revalidatePath("/control/operations");
  revalidatePath(`/account/orders/${orderId}`);
}

export async function runAdminOrderAction(formData: FormData) {
  const { user } = await requireControlPermission("manage_full_operations", "/control/operations");
  const { orderId, body } = adminOrderActionFromForm(formData);

  await performAdminOrderAction(createServiceClient(), orderId, body, `staff:${user.id}`);

  revalidatePath("/control");
  revalidatePath("/control/operations");
  revalidatePath(`/orders/${orderId}`);
}

export async function recordSupplierPurchaseOrder(formData: FormData) {
  const { user } = await requireControlPermission("manage_full_operations", "/control/operations");
  const input = adminPurchaseOrderFromForm(formData);

  const { error } = await createServiceClient().rpc("admin_create_supplier_purchase_order", {
    p_supplier_id: input.supplierId,
    p_sku_id: input.skuId,
    p_quantity: input.quantity,
    p_unit_cost_cents: input.unitCostCents,
    p_currency: input.currency,
    p_expected_at: input.expectedAt,
    p_notes: input.notes,
    p_actor: `staff:${user.id}`,
  });

  if (error) throw new Error(`Supplier purchase order intake failed: ${error.message}`);

  revalidatePath("/control");
  revalidatePath("/control/operations");
  revalidatePath("/catalog");
  revalidatePath("/preorders");
}

export async function runPreorderAllocation(formData: FormData) {
  const { user } = await requireControlPermission("manage_full_operations", "/control/operations");
  const skuId = String(formData.get("skuId") ?? "");

  await runPreorderAllocationForSku(createServiceClient(), skuId, `staff:${user.id}`);

  revalidatePath("/control");
  revalidatePath("/control/operations");
  revalidatePath("/preorders");
  revalidatePath("/catalog");
}
