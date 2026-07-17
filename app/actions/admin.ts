"use server";

import { revalidatePath } from "next/cache";
import {
  adminCatalogProductFromForm,
  adminCatalogSkuFromForm,
  adminInventoryAdjustmentFromForm,
} from "@/lib/admin-catalog-forms";
import { controlPurchaseOrderFromForm } from "@/lib/control-forms";
import { requireControlPermission } from "@/lib/control-access";
import { createServiceClient } from "@/lib/supabase";

export async function recordSupplierPurchaseOrder(formData: FormData) {
  const { user } = await requireControlPermission("manage_full_operations", "/control/operations");
  const input = controlPurchaseOrderFromForm(formData);

  const { error } = await createServiceClient().rpc("admin_record_supplier_purchase_order", {
    p_supplier_id: input.supplierId,
    p_sku_id: input.skuId,
    p_quantity: input.quantity,
    p_unit_cost_cents: input.unitCostCents,
    p_currency: input.currency,
    p_expected_at: input.expectedAt,
    p_notes: input.notes,
    p_actor: `staff:${user.id}`,
  });

  if (error) throw new Error(`Purchase order recording failed: ${error.message}`);

  revalidatePath("/control");
  revalidatePath("/control/operations");
  revalidatePath("/products");
}

export async function runPreorderAllocation(formData: FormData) {
  const { user } = await requireControlPermission("manage_full_operations", "/control/operations");
  const skuId = String(formData.get("skuId") ?? "");

  const { error } = await createServiceClient().rpc("admin_allocate_preorders", {
    p_sku_id: skuId,
    p_actor: `staff:${user.id}`,
  });

  if (error) throw new Error(`Preorder allocation failed: ${error.message}`);

  revalidatePath("/control");
  revalidatePath("/control/operations");
  revalidatePath("/preorders");
  revalidatePath("/products");
}

export async function runAdminOrderAction(formData: FormData) {
  const { user } = await requireControlPermission("manage_full_operations", "/control/operations");
  const action = String(formData.get("action") ?? "");
  const orderId = String(formData.get("orderId") ?? "");
  const reason = String(formData.get("reason") ?? "");
  const supabase = createServiceClient();

  if (action === "cancel_unpaid") {
    const { error } = await supabase.rpc("admin_cancel_unpaid_order", {
      p_order_id: orderId,
      p_reason: reason,
      p_actor: `staff:${user.id}`,
    });
    if (error) throw new Error(`Order cancellation failed: ${error.message}`);
  } else if (action === "record_manual_reconciliation") {
    const amountCents = Number(formData.get("amountCents") ?? 0);
    const currency = String(formData.get("currency") ?? "SGD").toUpperCase();
    const provider = String(formData.get("provider") ?? "stripe");
    const providerPaymentId = String(formData.get("providerPaymentId") ?? "");
    const { error } = await supabase.rpc("admin_record_manual_payment_reconciliation", {
      p_order_id: orderId,
      p_provider: provider,
      p_provider_payment_id: providerPaymentId,
      p_amount_cents: amountCents,
      p_currency: currency,
      p_reason: reason,
      p_actor: `staff:${user.id}`,
    });
    if (error) throw new Error(`Payment reconciliation failed: ${error.message}`);
  } else {
    throw new Error("Unsupported admin order action");
  }

  revalidatePath("/control");
  revalidatePath("/control/operations");
  revalidatePath("/account/orders");
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
  revalidatePath("/products");
}

export async function upsertCatalogProduct(formData: FormData) {
  const { user } = await requireControlPermission("manage_full_operations", "/control/operations");
  const input = adminCatalogProductFromForm(formData);

  const { error } = await createServiceClient().rpc("admin_upsert_catalog_product", {
    p_product_id: input.productId,
    p_category_id: input.categoryId,
    p_set_id: input.setId,
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
  revalidatePath("/products");
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
  revalidatePath("/products");
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
  revalidatePath("/products");
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
  revalidatePath("/products");
}
