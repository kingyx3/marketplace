"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { adminInventoryAdjustmentFromForm } from "@/lib/admin-catalog-forms";
import {
  adminLimitedTimeDealFromForm,
  adminLimitedTimeDealStatusFromForm,
  adminListingItemFromForm,
  adminListingPublicationFromForm,
  adminStorefrontConfigurationFromForm,
} from "@/lib/admin-listing-forms";
import { requiredUuid } from "@/lib/admin-form-values";
import { adminOrderActionFromForm } from "@/lib/admin-order-forms";
import { adminPurchaseOrderFromForm } from "@/lib/admin-purchase-order-forms";
import { requireControlPermission } from "@/lib/control-access";
import { performAdminOrderAction } from "@/lib/orders";
import { createSecretClient } from "@/lib/supabase";

export async function upsertLimitedTimeDeal(formData: FormData) {
  const sourceId = optionalFormId(formData, "dealId");
  const returnPath = sourceId ? `/control/pricing/deals/${sourceId}` : "/control/pricing/deals/new";
  const { user } = await requireControlPermission("pricing.manage", returnPath);
  const input = adminLimitedTimeDealFromForm(formData);
  if (input.active) await requireControlPermission("pricing.approve", returnPath);

  const supabase = createSecretClient();
  const { data: sku, error: skuError } = await supabase
    .from("booster_box_skus")
    .select("price_cents, currency")
    .eq("id", input.skuId)
    .maybeSingle();
  if (skuError) throw new Error(`Deal SKU price lookup failed: ${skuError.message}`);
  if (!sku) {
    return {
      status: "error" as const,
      message: "The selected SKU could not be found.",
      fieldErrors: { skuId: "Select an existing SKU." },
    };
  }

  const originalPriceCents = Number(sku.price_cents);
  if (!Number.isInteger(originalPriceCents) || originalPriceCents <= 0) {
    return {
      status: "error" as const,
      message: "The selected SKU needs a valid original price before a deal can be created.",
      fieldErrors: { skuId: "Set a positive SKU price in Pricing first." },
    };
  }
  if (input.dealPriceCents >= originalPriceCents) {
    return {
      status: "error" as const,
      message: "Deal price must be lower than the original price.",
      fieldErrors: { dealPrice: "Enter a deal price below the current original price." },
    };
  }

  const { data, error } = await supabase.rpc("admin_upsert_pricing_promotion", {
    p_deal_id: input.dealId,
    p_code: input.code,
    p_sku_id: input.skuId,
    p_title: input.title,
    p_description: input.description,
    p_deal_price_cents: input.dealPriceCents,
    p_visibility: input.visibility,
    p_starts_at: input.startsAt,
    p_ends_at: input.endsAt,
    p_sort_priority: input.sortPriority,
    p_active: input.active,
    p_actor_auth_user_id: user.id,
  });

  if (error?.code === "23505") {
    return {
      status: "error" as const,
      message: "Another promotion already uses this code. Choose a unique code.",
      fieldErrors: { code: "Promotion code must be unique." },
    };
  }
  if (error?.code === "22023" && error.message.toLowerCase().includes("deal price")) {
    return {
      status: "error" as const,
      message: "Deal price must be lower than the original price.",
      fieldErrors: { dealPrice: "Enter a positive deal price below the current original price." },
    };
  }
  if (error) throw new Error(`Limited-time deal save failed: ${error.message}`);

  const dealId = readRpcId(data, "deal_id") ?? input.dealId;
  if (!dealId)
    throw new Error("Limited-time deal save failed: the database did not return a deal ID");

  revalidateDealPaths(dealId);
  redirect(`/control/pricing/deals/${dealId}?saved=1`);
}

export async function setLimitedTimeDealActive(formData: FormData) {
  const dealId = String(formData.get("dealId") ?? "");
  const { user } = await requireControlPermission(
    "pricing.approve",
    dealId ? `/control/pricing/deals/${dealId}` : "/control/pricing/deals"
  );
  const input = adminLimitedTimeDealStatusFromForm(formData);

  const { error } = await createSecretClient().rpc("admin_set_pricing_promotion_active", {
    p_deal_id: input.dealId,
    p_active: input.active,
    p_actor_auth_user_id: user.id,
  });

  if (error) throw new Error(`Limited-time deal status update failed: ${error.message}`);
  revalidateDealPaths(input.dealId);
}

function revalidateDealPaths(dealId?: string) {
  revalidatePath("/");
  revalidatePath("/control");
  revalidatePath("/control/pricing/deals");
  if (dealId) revalidatePath(`/control/pricing/deals/${dealId}`);
  revalidatePath("/products");
}

export async function upsertListingItem(formData: FormData) {
  const productId = String(formData.get("productId") ?? "");
  const { user } = await requireControlPermission(
    "storefront.manage",
    productId ? `/control/storefront/listings/${productId}` : "/control/storefront/listings"
  );
  const input = adminListingItemFromForm(formData);

  const { error } = await createSecretClient().rpc("admin_upsert_storefront_listing", {
    p_product_id: input.productId,
    p_title_override: input.titleOverride,
    p_badge_label: input.badgeLabel,
    p_tags: input.tags,
    p_max_per_customer: input.maxPerCustomer,
    p_preorder_reserve: input.preorderReserve,
    p_sort_priority: input.sortPriority,
    p_featured: input.featured,
    p_availability_mode: input.availabilityMode,
    p_order_open_at: input.orderOpenAt,
    p_order_close_at: input.orderCloseAt,
    p_release_date: input.releaseDate,
    p_actor_auth_user_id: user.id,
  });

  if (error?.code === "23514") {
    throw new Error(`Listing is not ready to publish: ${error.message}`);
  }
  if (error) throw new Error(`Listing item save failed: ${error.message}`);

  revalidatePath("/control");
  revalidatePath("/control/catalog");
  revalidatePath("/control/storefront");
  revalidatePath("/control/storefront/listings");
  revalidatePath(`/control/storefront/listings/${input.productId}`);
  revalidatePath("/products");
  redirect(`/control/storefront/listings/${input.productId}?saved=1`);
}

export async function setListingPublished(formData: FormData) {
  const { productId, published } = adminListingPublicationFromForm(formData);
  const { user } = await requireControlPermission(
    "storefront.publish",
    productId ? `/control/storefront/listings/${productId}` : "/control/storefront/listings"
  );
  const { error } = await createSecretClient().rpc("admin_set_listing_publication", {
    p_product_id: productId,
    p_published: published,
    p_actor_auth_user_id: user.id,
  });
  if (error?.code === "23514") {
    throw new Error(`Listing is not ready to publish: ${error.message}`);
  }
  if (error) throw new Error(`Listing publication update failed: ${error.message}`);

  revalidatePath("/control");
  revalidatePath("/control/catalog");
  revalidatePath("/control/storefront");
  revalidatePath("/control/storefront/listings");
  revalidatePath(`/control/storefront/listings/${productId}`);
  revalidatePath("/products");
}

export async function upsertStorefrontConfiguration(formData: FormData) {
  const key = String(formData.get("key") ?? "");
  const { user } = await requireControlPermission(
    "storefront.manage",
    key
      ? `/control/storefront/listings/configurations/${encodeURIComponent(key)}`
      : "/control/storefront/listings"
  );
  const input = adminStorefrontConfigurationFromForm(formData);

  const { error } = await createSecretClient().rpc("admin_upsert_storefront_configuration", {
    p_key: input.key,
    p_label: input.label,
    p_description: input.description,
    p_value: input.value,
    p_active: input.active,
    p_actor: `staff:${user.id}`,
  });

  if (error) throw new Error(`Storefront configuration save failed: ${error.message}`);

  revalidatePath("/control");
  revalidatePath("/control/storefront/listings");
  revalidatePath(`/control/storefront/listings/configurations/${encodeURIComponent(input.key)}`);
  revalidatePath("/products");
  redirect(`/control/storefront/listings/configurations/${encodeURIComponent(input.key)}?saved=1`);
}

export async function updateInventory(formData: FormData) {
  const { user } = await requireControlPermission("inventory.adjust", "/control/supply");
  const input = adminInventoryAdjustmentFromForm(formData);

  const { error } = await createSecretClient().rpc("admin_adjust_inventory", {
    p_sku_id: input.skuId,
    p_on_hand: input.onHand,
    p_incoming: input.incoming,
    p_safety_stock: input.safetyStock,
    p_reason_code: input.reasonCode,
    p_reason_note: input.reasonNote,
    p_actor_auth_user_id: user.id,
  });

  if (error) throw new Error(`Inventory adjustment failed: ${error.message}`);

  revalidatePath("/control/supply");
  revalidatePath("/control");
  revalidatePath("/products");
}

export async function runAdminOrderAction(formData: FormData) {
  const { orderId, body } = adminOrderActionFromForm(formData);
  const permission =
    body.action === "record_manual_reconciliation"
      ? "payments.reconcile"
      : body.action === "mark_packing" || body.action === "ship"
        ? "fulfilment.manage"
        : "orders.manage";
  const returnPath =
    permission === "payments.reconcile"
      ? "/control/finance"
      : permission === "fulfilment.manage"
        ? "/control/fulfilment"
        : "/control/orders";
  const { user } = await requireControlPermission(permission, returnPath);

  await performAdminOrderAction(createSecretClient(), orderId, body, `staff:${user.id}`);

  revalidatePath("/control");
  revalidatePath("/control/orders");
  revalidatePath("/control/finance");
  revalidatePath("/control/fulfilment");
  revalidatePath(`/orders/${orderId}`);
  if (permission === "payments.reconcile") redirect("/control/finance?reconciled=1");
}

export async function recordSupplierPurchaseOrder(formData: FormData) {
  const { user } = await requireControlPermission("purchase_orders.manage", "/control/supply");
  const input = adminPurchaseOrderFromForm(formData);

  const { data, error } = await createSecretClient().rpc("admin_create_supplier_purchase_order", {
    p_supplier_id: input.supplierId,
    p_sku_id: input.skuId,
    p_quantity: input.quantity,
    p_unit_cost_cents: input.unitCostCents,
    p_currency: input.currency,
    p_expected_at: input.expectedAt,
    p_notes: input.notes,
    p_actor_auth_user_id: user.id,
  });

  if (error) throw new Error(`Supplier purchase order intake failed: ${error.message}`);

  const purchaseOrderId = readRpcId(data, "purchase_order_id");
  if (!purchaseOrderId) {
    throw new Error("Supplier purchase order intake failed: no purchase order ID was returned");
  }

  revalidatePath("/control");
  revalidatePath("/control/supply");
  revalidatePath(`/control/supply/purchase-orders/${purchaseOrderId}`);
  revalidatePath("/products");
  revalidatePath("/orders");
  redirect(`/control/supply/purchase-orders/${purchaseOrderId}?saved=1`);
}

export async function runPreorderAllocation(formData: FormData) {
  await requireControlPermission("preorders.allocate", "/control/orders/allocations");
  const skuId = requiredUuid(formData, "skuId", "skuId");
  redirect(`/control/orders/allocations/${encodeURIComponent(skuId)}`);
}

function readRpcId(data: unknown, key: string): string | null {
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== "object") return null;
  const value = (row as Record<string, unknown>)[key];
  return typeof value === "string" && value ? value : null;
}

function optionalFormId(formData: FormData, key: string): string | null {
  const value = formData.get(key);
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}
