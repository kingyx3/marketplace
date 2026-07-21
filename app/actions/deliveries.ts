"use server";

import { revalidatePath } from "next/cache";

import {
  adminDeliveryArrangementFromForm,
  adminDeliveryPackingFromForm,
  adminDeliveryStatusFromForm,
} from "@/lib/admin-delivery-forms";
import { requireControlPermission } from "@/lib/control-access";
import { createSecretClient } from "@/lib/supabase";

export async function markDeliveryPacking(formData: FormData) {
  const { orderId } = adminDeliveryPackingFromForm(formData);
  const { user } = await requireControlPermission(
    "fulfilment.manage",
    `/control/fulfilment/deliveries/${orderId}`
  );

  const { error } = await createSecretClient().rpc("admin_mark_order_packing", {
    p_order_id: orderId,
    p_actor: `staff:${user.id}`,
  });

  if (error) throw new Error(`Packing update failed: ${error.message}`);
  revalidateDeliveryPaths(orderId);
}

export async function arrangeDelivery(formData: FormData) {
  const input = adminDeliveryArrangementFromForm(formData);
  const { orderId } = input;
  const { user } = await requireControlPermission(
    "fulfilment.manage",
    `/control/fulfilment/deliveries/${orderId}`
  );
  const { error } = await createSecretClient().rpc("admin_arrange_delivery", {
    p_order_id: orderId,
    p_carrier: input.carrier,
    p_tracking_number: input.trackingNumber,
    p_address: input.address,
    p_actor: `staff:${user.id}`,
  });

  if (error) throw new Error(`Delivery arrangement failed: ${error.message}`);
  revalidateDeliveryPaths(orderId);
}

export async function updateDeliveryStatus(formData: FormData) {
  const input = adminDeliveryStatusFromForm(formData);
  const { orderId } = input;
  const { user } = await requireControlPermission(
    "fulfilment.manage",
    `/control/fulfilment/deliveries/${orderId}`
  );
  const { error } = await createSecretClient().rpc("admin_update_delivery_status", {
    p_order_id: orderId,
    p_shipment_id: input.shipmentId,
    p_status: input.status,
    p_actor: `staff:${user.id}`,
  });

  if (error) throw new Error(`Delivery status update failed: ${error.message}`);
  revalidateDeliveryPaths(orderId);
}

function revalidateDeliveryPaths(orderId: string) {
  revalidatePath("/control");
  revalidatePath("/control/fulfilment/deliveries");
  revalidatePath(`/control/fulfilment/deliveries/${orderId}`);
  revalidatePath("/account");
  revalidatePath("/orders");
  revalidatePath(`/orders/${orderId}`);
}
