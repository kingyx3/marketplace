"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";

import type { AdminActionResult } from "@/lib/admin-action-state";
import { requiredBoolean, requiredUuid } from "@/lib/admin-form-values";
import { requireControlPermission } from "@/lib/control-access";
import { logError } from "@/lib/observability";
import { createServiceClient } from "@/lib/supabase";

const LONG_BAN_DURATION = "876000h";

export interface CustomerLifecycleActionState {
  status: "idle" | "success" | "error";
  message: string;
}

export const initialCustomerLifecycleActionState: CustomerLifecycleActionState = {
  status: "idle",
  message: "",
};

interface CustomerLifecycleRow {
  id: string;
  auth_user_id: string | null;
  deleted_at: string | null;
}

export async function setCustomerAccountDeleted(
  _previousState: CustomerLifecycleActionState,
  formData: FormData
): Promise<CustomerLifecycleActionState> {
  const { user: actor } = await requireControlPermission("customers.manage", "/control/customers");

  try {
    const customerId = requiredUuid(formData, "customerId", "customerId");
    const deleted = requiredBoolean(formData, "deleted");

    if (deleted && formData.get("confirmDisable") !== "yes") {
      return failure("Confirm account disable before continuing");
    }

    const supabase = createServiceClient();
    const { data, error: lookupError } = await supabase
      .from("customers")
      .select("id, auth_user_id, deleted_at")
      .eq("id", customerId)
      .single();

    if (lookupError || !data) {
      return failure(`Customer lookup failed: ${lookupError?.message ?? "not found"}`);
    }

    const customer = data as CustomerLifecycleRow;
    if (!customer.auth_user_id) {
      return failure("No linked sign-in identity is available for automatic restoration");
    }
    if (deleted && customer.auth_user_id === actor.id) {
      return failure("You cannot disable your own account");
    }

    const { data: activeStaff, error: staffError } = await supabase
      .from("staff_users")
      .select("id")
      .eq("auth_user_id", customer.auth_user_id)
      .eq("active", true)
      .maybeSingle();
    if (staffError) return failure(`Staff safety check failed: ${staffError.message}`);
    if (deleted && activeStaff) {
      return failure("Active staff accounts must be managed from Administrators");
    }

    if (deleted === Boolean(customer.deleted_at)) {
      return success(deleted ? "Account is already disabled" : "Account is already active");
    }

    const { data: authData, error: authLookupError } = await supabase.auth.admin.getUserById(
      customer.auth_user_id
    );
    if (authLookupError || !authData.user) {
      return failure(`Auth user lookup failed: ${authLookupError?.message ?? "not found"}`);
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
      return failure(
        `Auth account ${deleted ? "disable" : "restore"} failed: ${authUpdateError.message}`
      );
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
      return failure(
        `Customer ${deleted ? "disable" : "restore"} failed: ${customerUpdateError.message}`
      );
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
    revalidatePath("/control/governance/audit");

    return success(deleted ? "Account disabled" : "Account restored");
  } catch (error) {
    return failure(safeError(error));
  }
}

export async function updateCustomerAccountLifecycle(
  formData: FormData
): Promise<AdminActionResult> {
  const result = await setCustomerAccountDeleted(initialCustomerLifecycleActionState, formData);
  if (result.status === "idle") {
    return { status: "error", message: "The customer account was not changed." };
  }
  if (result.status === "error" && !isActionableLifecycleMessage(result.message)) {
    const requestId = randomUUID();
    logError("customer.lifecycle_action_failed", new Error(result.message), {
      requestId,
      route: "/control/customers",
    });
    return {
      status: "error",
      message: `The customer account could not be changed. Error reference: ${requestId}`,
    };
  }
  return { status: result.status, message: result.message };
}

function success(message: string): CustomerLifecycleActionState {
  return { status: "success", message };
}

function failure(message: string): CustomerLifecycleActionState {
  return { status: "error", message };
}

function withoutDeletionMetadata(metadata: Record<string, unknown>): Record<string, unknown> {
  const next = { ...metadata };
  delete next.marketplace_account_deleted_at;
  return next;
}

function safeError(error: unknown): string {
  return error instanceof Error ? error.message : "Customer account update failed";
}

function isActionableLifecycleMessage(message: string): boolean {
  return /confirm|cannot|must be managed|no linked sign-in identity|already (disabled|active)/i.test(
    message
  );
}
