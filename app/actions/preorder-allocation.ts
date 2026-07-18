"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireControlPermission } from "@/lib/control-access";
import { executePreorderAllocationForSku } from "@/lib/preorders";
import { createStripeClient } from "@/lib/stripe";
import { createServiceClient } from "@/lib/supabase";

export async function confirmPreorderAllocation(formData: FormData): Promise<void> {
  const { user } = await requireControlPermission("manage_full_operations", "/control/preorders");
  const skuId = String(formData.get("skuId") ?? "").trim();
  const fingerprint = String(formData.get("fingerprint") ?? "").trim();
  const confirmed = String(formData.get("confirm") ?? "") === "yes";

  if (!confirmed) {
    redirect(`/control/preorders?sku=${encodeURIComponent(skuId)}&error=confirmation-required`);
  }

  try {
    const result = await executePreorderAllocationForSku(
      createServiceClient(),
      createStripeClient(),
      {
        skuId,
        fingerprint,
        actor: `staff:${user.id}`,
      }
    );

    revalidatePath("/control");
    revalidatePath("/control/preorders");
    revalidatePath("/control/operations");
    revalidatePath("/preorders");
    revalidatePath("/orders");

    const summary = `${result.finalized}-${result.refundsCreated}-${result.refundCents}`;
    redirect(`/control/preorders?success=${encodeURIComponent(summary)}`);
  } catch (error) {
    const code = allocationErrorCode(error);
    redirect(`/control/preorders?sku=${encodeURIComponent(skuId)}&error=${code}`);
  }
}

function allocationErrorCode(error: unknown): string {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (message.includes("changed") || message.includes("stale") || message.includes("refresh")) {
    return "stale-preview";
  }
  if (message.includes("stripe") || message.includes("refund")) return "refund-failed";
  if (message.includes("payment")) return "payment-missing";
  return "allocation-failed";
}
