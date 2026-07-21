"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireControlPermission } from "@/lib/control-access";
import { createHitPayClient } from "@/lib/hitpay";
import { executePreorderAllocationForSku } from "@/lib/preorders";
import { createSecretClient } from "@/lib/supabase";

export async function confirmPreorderAllocation(formData: FormData): Promise<void> {
  const { user } = await requireControlPermission(
    "preorders.allocate",
    "/control/orders/allocations"
  );
  await requireControlPermission("refunds.manage", "/control/orders/allocations");
  const skuId = String(formData.get("skuId") ?? "").trim();
  const fingerprint = String(formData.get("fingerprint") ?? "").trim();
  const confirmed = String(formData.get("confirm") ?? "") === "yes";

  if (!confirmed) {
    redirect(
      `/control/orders/allocations/${encodeURIComponent(skuId)}?error=confirmation-required`
    );
  }

  let summary: string;
  try {
    const result = await executePreorderAllocationForSku(
      createSecretClient(),
      createHitPayClient(),
      {
        skuId,
        fingerprint,
        actor: `staff:${user.id}`,
      }
    );

    revalidatePath("/control");
    revalidatePath("/control/orders/allocations");
    revalidatePath("/control/orders");
    revalidatePath("/orders");
    summary = `${result.finalized}-${result.refundsCreated}-${result.refundCents}`;
  } catch (error) {
    const code = allocationErrorCode(error);
    redirect(`/control/orders/allocations/${encodeURIComponent(skuId)}?error=${code}`);
  }

  redirect(`/control/orders/allocations?success=${encodeURIComponent(summary)}`);
}

function allocationErrorCode(error: unknown): string {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (message.includes("changed") || message.includes("stale") || message.includes("refresh")) {
    return "stale-preview";
  }
  if (message.includes("hitpay") || message.includes("refund")) return "refund-failed";
  if (message.includes("payment")) return "payment-missing";
  return "allocation-failed";
}
