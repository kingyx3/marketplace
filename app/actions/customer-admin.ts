"use server";

import { revalidatePath } from "next/cache";

import { requireControlPermission } from "@/lib/control-access";
import { createServiceClient } from "@/lib/supabase";

const LONG_BAN_DURATION = "876000h";

interface CustomerLifecycleRow {
  id: string;
  auth_user_id: string | null;
  deleted_at: string | null;
}

export async function setCustomerAccountDeleted(formData: FormData) {
  const { user: actor } = await requireControlPermission(
    "manage_customers",
    "/control/customers"
  );
  const customerId = String(formData.get("customerId") ?? "").trim();
  const deleted = String(formData.get("deleted") ?? "false") === "true";

  if (!customerId) throw new Error("Customer is required");

  const supabase = createServiceClient();
  const { data, error: lookupError } = await supabase
    .from("customers")
    .select("id, auth_user_id, deleted_at")
    .eq("id", customerId)
    .single();

  if (lookupError || !data) {
    throw new Error(`Customer lookup failed: ${lookupError?.message ?? "not found"}`);
  }

  const customer = data as CustomerLifecycleRow;
  if (!customer.auth_user_id) {
    throw new Error("This customer has no linked sign-in identity and cannot be restored automatically");
  }
  if (customer.auth_user_id === actor.id) {
    throw new Error("You cannot disable your own account");
  }

  const { data: activeStaff, error: staffError } = await supabase
    .from("staff_users")
    .select("id")
    .eq("auth_user_id", customer.auth_user_id)
    .eq("active", true)
    .maybeSingle();
  if (staffError) throw new Error(`Staff safety check failed: ${staffError.message}`);
  if (activeStaff) {
    throw new Error("Active staff accounts must be managed from Administrators");
  }

  if (deleted === Boolean(customer.deleted_at)) return;

  const { data: authData, error: authLookupError } = await supabase.auth.admin.getUserById(
    customer.auth_user_id
  );
  if (authLookupError || !authData.user) {
    throw new Error(`Auth user lookup failed: ${authLookupError?.message ?? "not found"}`);
  }

  const changedAt = new Date().toISOString();
  const actorLabel = `staff:${actor.id}`;
  const currentMetadata = authData.user.app_metadata ?? {};
  const nextMetadata = deleted
    ? { ...currentMetadata, marketplace_account_deleted_at: changedAt }
    : withoutDeletionMetadata(currentMetadata);

  const { error: authUpdateError } = await supabase.auth.admin.updateUserById(
    customer.auth_user_id,
    {
      ban_duration: deleted ? LONG_BAN_DURATION : "none",
      app_metadata: nextMetadata,
    }
  );
  if (authUpdateError) {
    throw new Error(`Auth account ${deleted ? "disable" : "restore"} failed: ${authUpdateError.message}`);
  }

  const customerUpdate = deleted
    ? {
        deleted_at: changedAt,
        deletion_actor: actorLabel,
        restored_at: null,
        restoration_actor: null,
        marketing_opt_in: false,
      }
    : {
        deleted_at: null,
        deletion_actor: null,
        restored_at: changedAt,
        restoration_actor: actorLabel,
      };

  const { error: customerUpdateError } = await supabase
    .from("customers")
    .update(customerUpdate)
    .eq("id", customer.id);

  if (customerUpdateError) {
    const rollbackMetadata = deleted
      ? withoutDeletionMetadata(nextMetadata)
      : { ...nextMetadata, marketplace_account_deleted_at: customer.deleted_at ?? changedAt };
    const { error: rollbackError } = await supabase.auth.admin.updateUserById(
      customer.auth_user_id,
      {
        ban_duration: deleted ? "none" : LONG_BAN_DURATION,
        app_metadata: rollbackMetadata,
      }
    );
    if (rollbackError) {
      console.error("customer auth rollback failed:", rollbackError.message);
    }
    throw new Error(`Customer ${deleted ? "disable" : "restore"} failed: ${customerUpdateError.message}`);
  }

  const { error: auditError } = await supabase.from("audit_logs").insert({
    actor: actorLabel,
    table_name: "customers",
    record_id: customer.id,
    action: deleted ? "CONTROL_CUSTOMER_DISABLE" : "CONTROL_CUSTOMER_RESTORE",
    new_data: {
      auth_user_id: customer.auth_user_id,
      deleted_at: deleted ? changedAt : null,
    },
  });
  if (auditError) console.error("customer lifecycle audit failed:", auditError.message);

  revalidatePath("/control");
  revalidatePath("/control/customers");
  revalidatePath("/control/audit");
}

function withoutDeletionMetadata(metadata: Record<string, unknown>): Record<string, unknown> {
  const { marketplace_account_deleted_at: _deletedAt, ...rest } = metadata;
  return rest;
}
