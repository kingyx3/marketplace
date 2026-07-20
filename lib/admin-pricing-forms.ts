import { z } from "zod";

const skuPriceSchema = z.object({
  skuId: z.uuid(),
  currency: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/),
  priceCents: z.coerce.number().int().positive(),
  compareAtCents: z
    .string()
    .trim()
    .transform((value) => (value ? Number(value) : null))
    .pipe(z.number().int().positive().nullable()),
});

export function adminSkuPriceFromForm(formData: FormData) {
  const input = skuPriceSchema.parse({
    skuId: String(formData.get("skuId") ?? ""),
    currency: String(formData.get("currency") ?? "SGD"),
    priceCents: String(formData.get("priceCents") ?? ""),
    compareAtCents: String(formData.get("compareAtCents") ?? ""),
  });
  if (input.compareAtCents !== null && input.compareAtCents < input.priceCents) {
    throw new Error("Comparison price cannot be below the selling price");
  }
  return input;
}
