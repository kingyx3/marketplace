import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import type { CustomerRecord } from "@/lib/api/auth";

export const accountUpdateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  phone: z.string().trim().min(3).max(40).nullable().optional(),
  segment: z.enum(["player", "collector", "investor", "reseller"]).optional(),
  marketingOptIn: z.boolean().optional(),
});

export async function getAccountProfile(_supabase: SupabaseClient, customer: CustomerRecord) {
  return { customer: publicCustomer(customer) };
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

  if (Object.keys(update).length === 0) return publicCustomer(customer);

  const { data, error } = await supabase
    .from("customers")
    .update(update)
    .eq("id", customer.id)
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message ?? "customer update failed");

  return publicCustomer(data as CustomerRecord);
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
