"use server";

import { revalidatePath } from "next/cache";

import { adminSkuPriceFromForm } from "@/lib/admin-pricing-forms";
import { requireControlPermission } from "@/lib/control-access";
import { createServiceClient } from "@/lib/supabase";

export async function setSkuPrice(formData: FormData) {
  const { user } = await requireControlPermission("pricing.manage", "/control/pricing");
  const input = adminSkuPriceFromForm(formData);
  const { error } = await createServiceClient().rpc("admin_set_sku_price", {
    p_sku_id: input.skuId,
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
