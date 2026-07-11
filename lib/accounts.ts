import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { CustomerRecord } from "@/lib/api/auth";

export const accountUpdateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  phone: z.string().trim().min(3).max(40).nullable().optional(),
  segment: z.enum(["player", "collector", "investor", "reseller"]).optional(),
  marketingOptIn: z.boolean().optional(),
});

export const b2bApplicationSchema = z.object({
  companyName: z.string().trim().min(1).max(160),
  businessRegNo: z.string().trim().min(1).max(80).nullable().optional(),
  billingAddress: z.record(z.string(), z.unknown()).default({}),
});

export async function getAccountProfile(supabase: SupabaseClient, customer: CustomerRecord) {
  const b2b = await supabase
    .from("b2b_accounts")
    .select(
      "id, company_name, business_reg_no, billing_address, credit_limit_cents, payment_terms, approved, approved_at, review_status, reviewed_at, review_note, created_at, updated_at"
    )
    .eq("customer_id", customer.id)
    .maybeSingle();
  if (b2b.error) {
    throw new Error(b2b.error.message);
  }

  return {
    customer: publicCustomer(customer),
    b2bAccount: b2b.data ?? null,
  };
}

export async function updateAccountProfile(
  supabase: SupabaseClient,
  customer: CustomerRecord,
  body: unknown
) {
  const input = accountUpdateSchema.parse(body);
  const update: Record<string, unknown> = {};

  if (input.name !== undefined) update.name = input.name;
  if (input.phone !== undefined) update.phone = input.phone;
  if (input.segment !== undefined) update.segment = input.segment;
  if (input.marketingOptIn !== undefined) update.marketing_opt_in = input.marketingOptIn;

  if (Object.keys(update).length === 0) {
    return publicCustomer(customer);
  }

  const { data, error } = await supabase
    .from("customers")
    .update(update)
    .eq("id", customer.id)
    .select("*")
    .single();
  if (error || !data) {
    throw new Error(error?.message ?? "customer update failed");
  }

  return publicCustomer(data as CustomerRecord);
}

export async function upsertB2bApplication(
  supabase: SupabaseClient,
  customer: CustomerRecord,
  body: unknown
) {
  const input = b2bApplicationSchema.parse(body);
  const { data, error } = await supabase
    .from("b2b_accounts")
    .upsert(
      {
        customer_id: customer.id,
        company_name: input.companyName,
        business_reg_no: input.businessRegNo ?? null,
        billing_address: input.billingAddress,
        payment_terms: "prepaid",
        approved: false,
        approved_at: null,
        review_status: "pending",
        reviewed_at: null,
        review_note: null,
      },
      { onConflict: "customer_id" }
    )
    .select(
      "id, company_name, business_reg_no, billing_address, credit_limit_cents, payment_terms, approved, approved_at, review_status, reviewed_at, review_note, created_at, updated_at"
    )
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "b2b application failed");
  }

  return data;
}

function publicCustomer(customer: CustomerRecord) {
  return {
    id: customer.id,
    email: customer.email,
    name: customer.name,
    phone: customer.phone,
    segment: customer.segment,
    defaultCurrency: customer.default_currency,
    marketingOptIn: customer.marketing_opt_in,
    createdAt: customer.created_at,
    updatedAt: customer.updated_at,
  };
}
