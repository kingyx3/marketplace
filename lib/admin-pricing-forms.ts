import { z } from "zod";

import {
  optionalInteger,
  requiredCurrency,
  requiredInteger,
  requiredUuid,
} from "@/lib/admin-form-values";

const skuPriceSchema = z
  .object({
    skuId: z.uuid(),
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

export function adminSkuPriceFromForm(formData: FormData) {
  const input = skuPriceSchema.parse({
    skuId: requiredUuid(formData, "skuId", "skuId"),
    currency: requiredCurrency(formData),
    priceCents: requiredInteger(formData, "priceCents", { min: 1 }),
    compareAtCents: optionalInteger(formData, "compareAtCents", { min: 1 }),
  });
  return input;
}
