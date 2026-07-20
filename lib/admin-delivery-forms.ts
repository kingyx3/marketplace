import { z } from "zod";

import { requiredString, requiredUuid } from "@/lib/admin-form-values";
import { badRequest } from "@/lib/api/errors";
import { deliveryStatuses } from "@/lib/deliveries";

const optionalBoundedText = (formData: FormData, key: string, max: number): string => {
  const value = formData.get(key);
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (trimmed.length > max) throw badRequest(`${key} must be ${max} characters or fewer`);
  return trimmed;
};

const addressSchema = z.object({
  recipientName: z.string().trim().min(1).max(120),
  line1: z.string().trim().min(1).max(200),
  line2: z.string().trim().max(200),
  city: z.string().trim().max(120),
  state: z.string().trim().max(120),
  postalCode: z.string().trim().min(1).max(32),
  countryCode: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/),
  phone: z.string().trim().max(50),
});

export function adminDeliveryPackingFromForm(formData: FormData) {
  return { orderId: requiredUuid(formData, "orderId", "orderId") };
}

export function adminDeliveryArrangementFromForm(formData: FormData) {
  return {
    orderId: requiredUuid(formData, "orderId", "orderId"),
    carrier: requiredString(formData, "carrier", { max: 80, label: "Carrier" }),
    trackingNumber: optionalBoundedText(formData, "trackingNumber", 120) || null,
    address: addressSchema.parse({
      recipientName: requiredString(formData, "recipientName", {
        max: 120,
        label: "Recipient",
      }),
      line1: requiredString(formData, "line1", { max: 200, label: "Address line 1" }),
      line2: optionalBoundedText(formData, "line2", 200),
      city: optionalBoundedText(formData, "city", 120),
      state: optionalBoundedText(formData, "state", 120),
      postalCode: requiredString(formData, "postalCode", {
        max: 32,
        label: "Postal code",
      }),
      countryCode: requiredString(formData, "countryCode", {
        max: 2,
        label: "Country code",
      }),
      phone: optionalBoundedText(formData, "phone", 50),
    }),
  };
}

export function adminDeliveryStatusFromForm(formData: FormData) {
  return {
    orderId: requiredUuid(formData, "orderId", "orderId"),
    shipmentId: requiredUuid(formData, "shipmentId", "shipmentId"),
    status: z.enum(deliveryStatuses).parse(requiredString(formData, "status")),
  };
}
