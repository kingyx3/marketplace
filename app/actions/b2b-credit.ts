"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireStaff } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase";

const creditTermsSchema = z.object({
  accountId: z.string().uuid(),
  paymentTerms: z
    .string()
    .trim()
    .regex(/^NET(?:[1-9]|[1-8][0-9]|90)$/i)
    .transform((value) => value.toUpperCase()),
  creditLimitCents: z.coerce.number().int().min(1).max(1_000_000_000),
});

const policySchema = z.object({
  enabled: z.boolean(),
  reservationHours: z.coerce.number().int().min(1).max(168),
  maxPaymentTermDays: z.coerce.number().int().min(1).max(90),
});

export async function saveB2bCreditTerms(formData: FormData) {
  const { user } = await requireStaff("/admin/wholesale/credit");
  const input = creditTermsSchema.parse({
    accountId: formData.get("accountId"),
    paymentTerms: formData.get("paymentTerms"),
    creditLimitCents: formData.get("creditLimitCents"),
  });

  const { error } = await createServiceClient().rpc("admin_set_b2b_credit_terms", {
    p_account_id: input.accountId,
    p_payment_terms: input.paymentTerms,
    p_credit_limit_cents: input.creditLimitCents,
    p_actor: `staff:${user.id}`,
  });

  if (error) {
    throw new Error(`B2B credit terms update failed: ${error.message}`);
  }

  revalidatePath("/admin/wholesale/credit");
  revalidatePath("/admin");
  revalidatePath("/cart");
}

export async function saveB2bInvoicePolicy(formData: FormData) {
  const { user } = await requireStaff("/admin/wholesale/credit");
  const input = policySchema.parse({
    enabled: formData.get("enabled") === "on",
    reservationHours: formData.get("reservationHours"),
    maxPaymentTermDays: formData.get("maxPaymentTermDays"),
  });

  const { error } = await createServiceClient().rpc("admin_upsert_storefront_configuration", {
    p_key: "b2b_invoice_policy",
    p_label: "B2B invoice credit policy",
    p_description:
      "Controls invoice eligibility, maximum NET terms, and how long inventory remains reserved before automatic cancellation.",
    p_value: {
      enabled: input.enabled,
      reservationHours: input.reservationHours,
      maxPaymentTermDays: input.maxPaymentTermDays,
      requirePurchaseOrderReference: true,
    },
    p_active: input.enabled,
    p_actor: `staff:${user.id}`,
  });

  if (error) {
    throw new Error(`B2B invoice policy update failed: ${error.message}`);
  }

  revalidatePath("/admin/wholesale/credit");
  revalidatePath("/admin");
  revalidatePath("/cart");
}
