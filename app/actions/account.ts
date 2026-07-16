"use server";

import { redirect } from "next/navigation";

import { requireCustomer } from "@/lib/auth";
import { createServiceClient, createUserClient } from "@/lib/supabase";

interface CustomerDeletionSnapshot {
  auth_user_id: string | null;
  email: string;
  name: string | null;
  phone: string | null;
  marketing_opt_in: boolean;
  stripe_customer_id: string | null;
  billing_state: string;
  deleted_at: string | null;
}

export async function deleteAccount(formData: FormData) {
  if (formData.get("confirmDeletion") !== "yes") {
    redirect("/account?error=confirm-delete");
  }

  const { user, customer } = await requireCustomer("/account");
  const supabase = createServiceClient();
  const { data, error: lookupError } = await supabase
    .from("customers")
    .select(
      "auth_user_id, email, name, phone, marketing_opt_in, stripe_customer_id, billing_state, deleted_at"
    )
    .eq("id", customer.id)
    .eq("auth_user_id", user.id)
    .is("deleted_at", null)
    .single();

  if (lookupError || !data) {
    console.error("account deletion lookup failed:", lookupError?.message ?? "customer not found");
    redirect("/account?error=delete-failed");
  }

  const snapshot = data as CustomerDeletionSnapshot;
  const deletedAt = new Date().toISOString();
  const redactedEmail = `deleted+${customer.id}@deleted.invalid`;
  const { error: customerError } = await supabase
    .from("customers")
    .update({
      auth_user_id: null,
      email: redactedEmail,
      name: null,
      phone: null,
      marketing_opt_in: false,
      stripe_customer_id: null,
      billing_state: "cancelled",
      deleted_at: deletedAt,
    })
    .eq("id", customer.id)
    .eq("auth_user_id", user.id)
    .is("deleted_at", null);

  if (customerError) {
    console.error("account deletion update failed:", customerError.message);
    redirect("/account?error=delete-failed");
  }

  const { error: authError } = await supabase.auth.admin.deleteUser(user.id, true);
  if (authError) {
    const { error: rollbackError } = await supabase
      .from("customers")
      .update(snapshot)
      .eq("id", customer.id)
      .is("auth_user_id", null)
      .eq("deleted_at", deletedAt);

    console.error("account auth soft deletion failed:", authError.message);
    if (rollbackError) {
      console.error("account deletion rollback failed:", rollbackError.message);
    }
    redirect("/account?error=delete-failed");
  }

  try {
    const userClient = await createUserClient();
    await userClient.auth.signOut();
  } catch (error) {
    console.error("deleted account sign out failed:", safeError(error));
  }

  redirect("/?account=deleted");
}

function safeError(error: unknown): string {
  return error instanceof Error ? error.message : "unknown";
}
