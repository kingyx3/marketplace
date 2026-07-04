"use server";

import { revalidatePath } from "next/cache";

import { requireStaff } from "@/lib/auth";
import { runPreorderAllocationForSku } from "@/lib/preorders";
import { createServiceClient } from "@/lib/supabase";

export async function updateInventory(formData: FormData) {
  await requireStaff("/admin/inventory");
  const skuId = String(formData.get("skuId") ?? "");
  const onHand = toNonNegativeInt(formData.get("onHand"));
  const incoming = toNonNegativeInt(formData.get("incoming"));
  const safetyStock = toNonNegativeInt(formData.get("safetyStock"));

  const supabase = createServiceClient();
  const { error } = await supabase
    .from("inventory")
    .update({ on_hand: onHand, incoming, safety_stock: safetyStock })
    .eq("sku_id", skuId)
    .eq("location", "main");

  if (error) {
    throw new Error(`Inventory update failed: ${error.message}`);
  }

  revalidatePath("/admin/inventory");
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

export async function approveWholesale(formData: FormData) {
  await requireStaff("/admin/wholesale");
  const accountId = String(formData.get("accountId") ?? "");

  const supabase = createServiceClient();
  const { error } = await supabase
    .from("b2b_accounts")
    .update({ approved: true, approved_at: new Date().toISOString() })
    .eq("id", accountId);

  if (error) {
    throw new Error(`Wholesale approval failed: ${error.message}`);
  }

  revalidatePath("/admin/wholesale");
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

function toNonNegativeInt(value: FormDataEntryValue | null): number {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.trunc(parsed);
}
