"use server";

import { revalidatePath } from "next/cache";

import { badRequest } from "@/lib/api/errors";
import { requireControlPermission } from "@/lib/control-access";
import { deliveryStatuses, type DeliveryStatus } from "@/lib/deliveries";
import { createServiceClient } from "@/lib/supabase";

export async function markDeliveryPacking(formData: FormData) {
  const orderId = requiredString(formData, "orderId");
  const { user } = await requireControlPermission(
    "manage_orders",
    `/control/deliveries/${orderId}`
  );

  const { error } = await createServiceClient().rpc("admin_mark_order_packing", {
    p_order_id: orderId,
    p_actor: `staff:${user.id}`,
  });

  if (error) throw new Error(`Packing update failed: ${error.message}`);
  revalidateDeliveryPaths(orderId);
}

export async function arrangeDelivery(formData: FormData) {
  const orderId = requiredString(formData, "orderId");
  const { user } = await requireControlPermission(
    "manage_orders",
    `/control/deliveries/${orderId}`
  );
  const address = {
    recipientName: requiredString(formData, "recipientName"),
    line1: requiredString(formData, "line1"),
    line2: optionalString(formData, "line2") ?? "",
    city: optionalString(formData, "city") ?? "",
    state: optionalString(formData, "state") ?? "",
    postalCode: requiredString(formData, "postalCode"),
    countryCode: requiredString(formData, "countryCode").toUpperCase(),
    phone: optionalString(formData, "phone") ?? "",
  };

  const { error } = await createServiceClient().rpc("admin_arrange_delivery", {
    p_order_id: orderId,
    p_carrier: requiredString(formData, "carrier"),
    p_tracking_number: optionalString(formData, "trackingNumber") ?? null,
    p_address: address,
    p_actor: `staff:${user.id}`,
  });

  if (error) throw new Error(`Delivery arrangement failed: ${error.message}`);
  revalidateDeliveryPaths(orderId);
}

export async function updateDeliveryStatus(formData: FormData) {
  const orderId = requiredString(formData, "orderId");
  const { user } = await requireControlPermission(
    "manage_orders",
    `/control/deliveries/${orderId}`
  );
  const status = requiredString(formData, "status");

  if (!deliveryStatuses.includes(status as DeliveryStatus)) {
    throw badRequest("Unsupported delivery status");
  }

  const { error } = await createServiceClient().rpc("admin_update_delivery_status", {
    p_order_id: orderId,
    p_shipment_id: requiredString(formData, "shipmentId"),
    p_status: status,
    p_actor: `staff:${user.id}`,
  });

  if (error) throw new Error(`Delivery status update failed: ${error.message}`);
  revalidateDeliveryPaths(orderId);
}

function revalidateDeliveryPaths(orderId: string) {
  revalidatePath("/control");
  revalidatePath("/control/deliveries");
  revalidatePath(`/control/deliveries/${orderId}`);
  revalidatePath("/account");
  revalidatePath("/orders");
  revalidatePath(`/orders/${orderId}`);
}

function requiredString(formData: FormData, key: string): string {
  const value = optionalString(formData, key);
  if (!value) throw badRequest(`${key} is required`);
  return value;
}

function optionalString(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}
