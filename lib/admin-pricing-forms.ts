import { z } from "zod";

import {
  optionalInteger,
  requiredCurrency,
  requiredInteger,
  requiredUuid,
} from "@/lib/admin-form-values";

const productPriceSchema = z
  .object({
    productId: z.uuid(),
    currency: z.string().regex(/^[A-Z]{3}$/),
    priceCents: z.number().int().positive(),
    compareAtCents: z.number().int().positive().nullable(),
  })
  .superRefine((input, context) => {
    if (input.compareAtCents !== null && input.compareAtCents <= input.priceCents) {
      context.addIssue({
        code: "custom",
        path: ["compareAtCents"],
        message: "Comparison price must be above the selling price",
      });
    }
  });

export function adminProductPriceFromForm(formData: FormData) {
  const input = productPriceSchema.parse({
    productId: requiredUuid(formData, "productId", "productId"),
    currency: requiredCurrency(formData),
    priceCents: requiredInteger(formData, "priceCents", { min: 1 }),
    compareAtCents: optionalInteger(formData, "compareAtCents", { min: 1 }),
  });
  return input;
}
