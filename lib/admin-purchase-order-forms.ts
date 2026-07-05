import { badRequest } from "@/lib/api/errors";

export interface AdminPurchaseOrderInput {
  supplierId: string;
  skuId: string;
  quantity: number;
  unitCostCents: number;
  currency: string;
  expectedAt: string | null;
  notes: string | null;
}

export function adminPurchaseOrderFromForm(formData: FormData): AdminPurchaseOrderInput {
  const currency = requiredString(formData, "currency").toUpperCase();

  if (!/^[A-Z]{3}$/.test(currency)) {
    throw badRequest("currency must be a 3-letter code");
  }

  return {
    supplierId: requiredString(formData, "supplierId"),
    skuId: requiredString(formData, "skuId"),
    quantity: requiredPositiveInteger(formData, "quantity"),
    unitCostCents: requiredNonNegativeInteger(formData, "unitCostCents"),
    currency,
    expectedAt: optionalString(formData, "expectedAt") ?? null,
    notes: optionalString(formData, "notes") ?? null,
  };
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
  const value = requiredInteger(formData, key);
  if (value <= 0) {
    throw badRequest(`${key} must be a positive integer`);
  }
  return value;
}

function requiredNonNegativeInteger(formData: FormData, key: string): number {
  const value = requiredInteger(formData, key);
  if (value < 0) {
    throw badRequest(`${key} must be a non-negative integer`);
  }
  return value;
}

function requiredInteger(formData: FormData, key: string): number {
  const raw = requiredString(formData, key);
  const value = Number(raw);
  if (!Number.isInteger(value)) {
    throw badRequest(`${key} must be an integer`);
  }
  return value;
}
