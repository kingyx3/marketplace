import { badRequest } from "@/lib/api/errors";
import {
  optionalUuid,
  requiredCurrency,
  requiredInteger,
  requiredString,
  requiredUuid,
} from "@/lib/admin-form-values";
import { adminOrderActionSchema } from "@/lib/orders";

export function adminOrderActionFromForm(formData: FormData) {
  const action = requiredString(formData, "action");
  const orderId = requiredUuid(formData, "orderId", "orderId");

  let body: unknown;

  switch (action) {
    case "mark_packing":
      body = { action };
      break;
    case "ship":
      body = {
        action,
        carrier: requiredString(formData, "carrier", { max: 80, label: "Carrier" }),
        trackingNumber: requiredString(formData, "trackingNumber", {
          max: 120,
          label: "Tracking number",
        }),
      };
      break;
    case "cancel_unpaid":
      body = {
        action,
        reason: requiredString(formData, "reason", { min: 3, max: 500, label: "Reason" }),
      };
      break;
    case "flag_payment_exception":
      body = {
        action,
        paymentId: optionalUuid(formData, "paymentId", "paymentId") ?? undefined,
        exceptionType: formData.get("exceptionType") || "manual_flag",
        severity: formData.get("severity") || "warning",
        detail: requiredString(formData, "detail", { min: 3, max: 1000, label: "Detail" }),
      };
      break;
    case "record_manual_reconciliation":
      body = {
        action,
        provider: requiredString(formData, "provider", { min: 2, max: 40 }),
        providerPaymentId: requiredString(formData, "providerPaymentId", {
          min: 3,
          max: 200,
        }),
        amountCents: requiredInteger(formData, "amountCents", { min: 1 }),
        currency: requiredCurrency(formData),
        reason: requiredString(formData, "reason", { min: 3, max: 500 }),
      };
      break;
    default:
      throw badRequest("Unsupported admin order action");
  }

  return { orderId, body: adminOrderActionSchema.parse(body) };
}
