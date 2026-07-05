import { badRequest } from "@/lib/api/errors";

export function adminOrderActionFromForm(formData: FormData) {
  const action = requiredString(formData, "action");
  const orderId = requiredString(formData, "orderId");

  switch (action) {
    case "mark_packing":
      return { orderId, body: { action } };
    case "ship":
      return {
        orderId,
        body: {
          action,
          carrier: requiredString(formData, "carrier"),
          trackingNumber: requiredString(formData, "trackingNumber"),
        },
      };
    case "cancel_unpaid":
      return {
        orderId,
        body: {
          action,
          reason: requiredString(formData, "reason"),
        },
      };
    case "flag_payment_exception":
      return {
        orderId,
        body: {
          action,
          paymentId: optionalString(formData, "paymentId"),
          exceptionType: optionalString(formData, "exceptionType") ?? "manual_flag",
          severity: optionalString(formData, "severity") ?? "warning",
          detail: requiredString(formData, "detail"),
        },
      };
    case "record_manual_reconciliation":
      return {
        orderId,
        body: {
          action,
          provider: requiredString(formData, "provider"),
          providerPaymentId: requiredString(formData, "providerPaymentId"),
          amountCents: requiredPositiveInteger(formData, "amountCents"),
          currency: requiredString(formData, "currency").toUpperCase(),
          reason: requiredString(formData, "reason"),
        },
      };
    default:
      throw badRequest("Unsupported admin order action");
  }
}

function requiredString(formData: FormData, key: string): string {
  const value = optionalString(formData, key);
  if (!value) {
    throw badRequest(`${key} is required`);
  }
  return value;
}

function optionalString(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function requiredPositiveInteger(formData: FormData, key: string): number {
  const raw = requiredString(formData, key);
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw badRequest(`${key} must be a positive integer`);
  }
  return value;
}
