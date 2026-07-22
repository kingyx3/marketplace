"use server";

import { revalidatePath } from "next/cache";

import { adminProductPriceFromForm } from "@/lib/admin-pricing-forms";
import { requireControlPermission } from "@/lib/control-access";
import { createSecretClient } from "@/lib/supabase";

export async function setProductPrice(formData: FormData) {
  const { user } = await requireControlPermission("pricing.manage", "/control/pricing");
  const input = adminProductPriceFromForm(formData);
  const { error } = await createSecretClient().rpc("admin_set_product_price", {
    p_product_id: input.productId,
    p_currency: input.currency,
    p_price_cents: input.priceCents,
    p_compare_at_cents: input.compareAtCents,
    p_actor_auth_user_id: user.id,
  });
  if (error) throw new Error(`Price save failed: ${error.message}`);

  revalidatePath("/control");
  revalidatePath("/control/catalog");
  revalidatePath("/control/pricing");
  revalidatePath("/control/storefront");
  revalidatePath("/products");
}
