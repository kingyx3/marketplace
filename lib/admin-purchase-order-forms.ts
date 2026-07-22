import { badRequest } from "@/lib/api/errors";
import {
  POSTGRES_INTEGER_MAX,
  optionalIsoDate,
  optionalString,
  requiredCurrency,
  requiredInteger,
  requiredUuid,
} from "@/lib/admin-form-values";

export interface AdminPurchaseOrderInput {
  supplierId: string;
  productId: string;
  quantity: number;
  unitCostCents: number;
  currency: string;
  expectedAt: string | null;
  notes: string | null;
}

export function adminPurchaseOrderFromForm(formData: FormData): AdminPurchaseOrderInput {
  const currency = requiredCurrency(formData);
  const quantity = requiredInteger(formData, "quantity", { min: 1 });
  const unitCostCents = requiredInteger(formData, "unitCostCents", { min: 0 });
  if (quantity * unitCostCents > POSTGRES_INTEGER_MAX) {
    throw badRequest("purchase order total exceeds the supported maximum");
  }

  return {
    supplierId: requiredUuid(formData, "supplierId", "supplierId"),
    productId: requiredUuid(formData, "productId", "productId"),
    quantity,
    unitCostCents,
    currency,
    expectedAt: optionalIsoDate(formData, "expectedAt"),
    notes: optionalString(formData, "notes", { max: 500, label: "Notes" }) ?? null,
  };
}
