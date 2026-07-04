"use server";

import { revalidatePath } from "next/cache";

import { requireCustomer } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase";

export async function applyForWholesale(formData: FormData) {
  const { customer } = await requireCustomer("/wholesale");
  const companyName = String(formData.get("companyName") ?? "").trim();
  const businessRegNo = String(formData.get("businessRegNo") ?? "").trim();

  if (!companyName) {
    throw new Error("Company name is required");
  }

  const supabase = createServiceClient();
  const { error } = await supabase.from("b2b_accounts").upsert(
    {
      customer_id: customer.id,
      company_name: companyName,
      business_reg_no: businessRegNo || null,
      billing_address: {},
      payment_terms: "prepaid",
      approved: false,
      approved_at: null,
    },
    { onConflict: "customer_id" }
  );

  if (error) {
    throw new Error(`Wholesale application failed: ${error.message}`);
  }

  revalidatePath("/wholesale");
  revalidatePath("/admin");
}
