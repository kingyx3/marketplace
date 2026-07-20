"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { requireCustomer } from "@/lib/auth";
import { createServiceClient, createUserClient } from "@/lib/supabase";

export async function updateAccountSettings(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  if (name.length > 100) {
    redirect("/account?settings=invalid#settings");
  }

  const { user, customer } = await requireCustomer("/account");
  const { error } = await createServiceClient()
    .from("customers")
    .update({
      name: name || null,
      marketing_opt_in: formData.get("marketingOptIn") === "yes",
    })
    .eq("id", customer.id)
    .eq("auth_user_id", user.id)
    .is("deleted_at", null);

  if (error) {
    console.error("account settings update failed:", error.message);
    redirect("/account?settings=failed#settings");
  }

  revalidatePath("/account");
  redirect("/account?settings=updated#settings");
}

export async function deleteAccount(formData: FormData) {
  if (formData.get("confirmDeletion") !== "yes") {
    redirect("/account?error=confirm-delete");
  }

  const { user, customer } = await requireCustomer("/account");
  const supabase = createServiceClient();
  const deletedAt = new Date().toISOString();
  const deletionActor = `customer:${user.id}`;

  const { error: customerError } = await supabase
    .from("customers")
    .update({
      deleted_at: deletedAt,
      deletion_actor: deletionActor,
      restored_at: null,
      restoration_actor: null,
      marketing_opt_in: false,
    })
    .eq("id", customer.id)
    .eq("auth_user_id", user.id)
    .is("deleted_at", null);

  if (customerError) {
    console.error("account deletion update failed:", customerError.message);
    redirect("/account?error=delete-failed");
  }

  const { error: authError } = await supabase.auth.admin.updateUserById(user.id, {
    ban_duration: "876000h",
    app_metadata: {
      ...(user.app_metadata ?? {}),
      marketplace_account_deleted_at: deletedAt,
    },
  });

  if (authError) {
    const { error: rollbackError } = await supabase
      .from("customers")
      .update({
        deleted_at: null,
        deletion_actor: null,
      })
      .eq("id", customer.id)
      .eq("auth_user_id", user.id)
      .eq("deleted_at", deletedAt);

    console.error("account auth disable failed:", authError.message);
    if (rollbackError) {
      console.error("account deletion rollback failed:", rollbackError.message);
    }
    redirect("/account?error=delete-failed");
  }

  try {
    const userClient = await createUserClient();
    await userClient.auth.signOut({ scope: "global" });
  } catch (error) {
    console.error("deleted account sign out failed:", safeError(error));
  }

  redirect("/?account=deleted");
}

function safeError(error: unknown): string {
  return error instanceof Error ? error.message : "unknown";
}
