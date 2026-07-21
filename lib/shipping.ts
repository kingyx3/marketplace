import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { badRequest } from "@/lib/api/errors";

const MAX_SHIPPING_CENTS = 1_000_000;
const SUPPORTED_TAX_COUNTRY = "SG";

export const shippingAddressSchema = z
  .object({
    recipientName: z.string().trim().min(1).max(120),
    line1: z.string().trim().min(1).max(160),
    line2: z.string().trim().max(160).optional(),
    city: z.string().trim().max(120).optional(),
    region: z.string().trim().max(120).optional(),
    postalCode: z.string().trim().min(2).max(20),
    countryCode: z
      .string()
      .trim()
      .length(2)
      .transform((value) => value.toUpperCase()),
    phone: z.string().trim().min(3).max(40).optional(),
  })
  .strict();

const shippingPolicySchema = z
  .object({
    enabled: z.boolean(),
    currency: z
      .string()
      .trim()
      .length(3)
      .transform((value) => value.toUpperCase()),
    supportedCountryCodes: z
      .array(
        z
          .string()
          .trim()
          .length(2)
          .transform((value) => value.toUpperCase())
      )
      .min(1)
      .max(32)
      .refine(
        (countryCodes) => countryCodes.every((code) => code === SUPPORTED_TAX_COUNTRY),
        "Only Singapore shipping is supported until jurisdiction-aware tax calculation is implemented"
      ),
    flatRateCents: z.number().int().min(0).max(MAX_SHIPPING_CENTS),
    freeShippingThresholdCents: z
      .number()
      .int()
      .min(0)
      .max(MAX_SHIPPING_CENTS)
      .nullable()
      .optional(),
    serviceName: z.string().trim().min(1).max(120),
  })
  .strict();

export type ShippingAddress = z.infer<typeof shippingAddressSchema>;

export interface ShippingQuote {
  shippingCents: number;
  serviceName: string;
  policyKey: "shipping_policy";
}

export async function quoteShipping(
  supabase: SupabaseClient,
  rawAddress: unknown,
  merchandiseTotalCents: number,
  currency: string
): Promise<ShippingQuote> {
  const address = shippingAddressSchema.parse(rawAddress);
  if (address.countryCode !== SUPPORTED_TAX_COUNTRY) {
    throw badRequest("Shipping is currently available only within Singapore");
  }

  const result = await supabase
    .from("storefront_configurations")
    .select("value, active")
    .eq("key", "shipping_policy")
    .maybeSingle();

  if (result.error) {
    throw new Error(result.error.message);
  }
  if (!result.data?.active) {
    throw badRequest("Shipping checkout is not configured");
  }

  const parsed = shippingPolicySchema.safeParse(result.data.value);
  if (!parsed.success || !parsed.data.enabled) {
    throw badRequest("Shipping checkout is not configured");
  }

  const policy = parsed.data;
  const quoteCurrency = currency.trim().toUpperCase();
  if (policy.currency !== quoteCurrency) {
    throw badRequest("Shipping is not configured for this currency");
  }
  if (!policy.supportedCountryCodes.includes(address.countryCode)) {
    throw badRequest("Shipping is not available for this destination");
  }

  const qualifiesForFreeShipping =
    policy.freeShippingThresholdCents !== null &&
    policy.freeShippingThresholdCents !== undefined &&
    merchandiseTotalCents >= policy.freeShippingThresholdCents;

  return {
    shippingCents: qualifiesForFreeShipping ? 0 : policy.flatRateCents,
    serviceName: policy.serviceName,
    policyKey: "shipping_policy",
  };
}
