import type { SupabaseClient } from "@supabase/supabase-js";

export interface StaffProfile {
  id: string;
  role: "staff" | "admin" | "owner";
  active: boolean;
}

/**
 * Resolve the staff profile for a user whose email has already passed the
 * server-side admin allowlist check.
 *
 * A missing row is provisioned as an active admin so newly allowlisted users
 * can immediately see and use the admin surface. Existing inactive rows are
 * never reactivated automatically, preserving explicit staff revocation.
 */
export async function resolveAllowlistedAdminStaff(
  supabase: SupabaseClient,
  authUserId: string
): Promise<StaffProfile | null> {
  const existing = await readStaffProfile(supabase, authUserId);
  if (existing) return existing.active ? existing : null;

  const inserted = await supabase
    .from("staff_users")
    .insert({ auth_user_id: authUserId, role: "admin", active: true })
    .select("id, role, active")
    .single();

  if (inserted.error?.code === "23505") {
    const concurrent = await readStaffProfile(supabase, authUserId);
    return concurrent?.active ? concurrent : null;
  }

  if (inserted.error || !inserted.data) {
    throw new Error(`Staff provisioning failed: ${inserted.error?.message ?? "row missing"}`);
  }

  return inserted.data as StaffProfile;
}

async function readStaffProfile(
  supabase: SupabaseClient,
  authUserId: string
): Promise<StaffProfile | null> {
  const { data, error } = await supabase
    .from("staff_users")
    .select("id, role, active")
    .eq("auth_user_id", authUserId)
    .maybeSingle();

  if (error) {
    throw new Error(`Staff lookup failed: ${error.message}`);
  }

  return data ? (data as StaffProfile) : null;
}
