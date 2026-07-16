import type { SupabaseClient } from "@supabase/supabase-js";

export type StaffRole =
  | "viewer"
  | "support"
  | "catalog"
  | "operations"
  | "admin"
  | "owner";

export interface StaffProfile {
  id: string;
  role: StaffRole;
  active: boolean;
  email?: string | null;
  source?: "database" | "environment";
  created_by_staff_id?: string | null;
  last_seen_at?: string | null;
}

interface ResolveAdminStaffInput {
  authUserId: string;
  email: string | null | undefined;
  environmentAllowlisted: boolean;
}

interface AccessGrant {
  id: string;
  role: StaffRole;
  active: boolean;
  created_by_staff_id: string | null;
}

const STAFF_COLUMNS =
  "id, role, active, email, source, created_by_staff_id, last_seen_at";

/**
 * Resolve the active operations profile for a signed-in user.
 *
 * Environment allowlisted emails are authoritative owners. Database-managed
 * grants are matched by normalized email and provision a staff row on first
 * sign-in. Existing explicit revocations remain denied for non-environment
 * users.
 */
export async function resolveAdminStaff(
  supabase: SupabaseClient,
  input: ResolveAdminStaffInput
): Promise<StaffProfile | null> {
  const email = normalizeAdminEmail(input.email);
  const existing = await readStaffProfile(supabase, input.authUserId);

  if (input.environmentAllowlisted) {
    const environmentProfile = existing
      ? await updateEnvironmentOwner(supabase, existing.id, email)
      : await insertStaffProfile(supabase, {
          auth_user_id: input.authUserId,
          email,
          role: "owner",
          active: true,
          source: "environment",
          last_seen_at: new Date().toISOString(),
        });

    return environmentProfile;
  }

  if (existing) {
    if (!existing.active) return null;
    return touchStaffProfile(supabase, existing, email);
  }

  if (!email) return null;

  const grantResult = await supabase
    .from("admin_access_grants")
    .select("id, role, active, created_by_staff_id")
    .eq("email", email)
    .eq("active", true)
    .maybeSingle();

  if (grantResult.error) {
    throw new Error(`Administrator grant lookup failed: ${grantResult.error.message}`);
  }

  const grant = grantResult.data as AccessGrant | null;
  if (!grant?.active) return null;

  const profile = await insertStaffProfile(supabase, {
    auth_user_id: input.authUserId,
    email,
    role: grant.role,
    active: true,
    source: "database",
    created_by_staff_id: grant.created_by_staff_id,
    last_seen_at: new Date().toISOString(),
  });

  const accepted = await supabase
    .from("admin_access_grants")
    .update({ auth_user_id: input.authUserId, accepted_at: new Date().toISOString() })
    .eq("id", grant.id);

  if (accepted.error) {
    throw new Error(`Administrator grant acceptance failed: ${accepted.error.message}`);
  }

  return profile;
}

/** Compatibility wrapper for older call sites and focused unit tests. */
export function resolveAllowlistedAdminStaff(
  supabase: SupabaseClient,
  authUserId: string,
  email?: string | null
): Promise<StaffProfile | null> {
  return resolveAdminStaff(supabase, {
    authUserId,
    email,
    environmentAllowlisted: true,
  });
}

export function normalizeAdminEmail(value: string | null | undefined): string | null {
  const normalized = value?.trim().toLowerCase();
  return normalized || null;
}

async function updateEnvironmentOwner(
  supabase: SupabaseClient,
  staffId: string,
  email: string | null
): Promise<StaffProfile> {
  const result = await supabase
    .from("staff_users")
    .update({
      email,
      role: "owner",
      active: true,
      source: "environment",
      last_seen_at: new Date().toISOString(),
    })
    .eq("id", staffId)
    .select(STAFF_COLUMNS)
    .single();

  if (result.error || !result.data) {
    throw new Error(`Environment owner synchronization failed: ${result.error?.message ?? "row missing"}`);
  }

  return result.data as StaffProfile;
}

async function touchStaffProfile(
  supabase: SupabaseClient,
  existing: StaffProfile,
  email: string | null
): Promise<StaffProfile> {
  const result = await supabase
    .from("staff_users")
    .update({ email: email ?? existing.email ?? null, last_seen_at: new Date().toISOString() })
    .eq("id", existing.id)
    .select(STAFF_COLUMNS)
    .single();

  if (result.error || !result.data) {
    throw new Error(`Staff activity update failed: ${result.error?.message ?? "row missing"}`);
  }

  return result.data as StaffProfile;
}

async function insertStaffProfile(
  supabase: SupabaseClient,
  input: Record<string, unknown>
): Promise<StaffProfile> {
  const inserted = await supabase
    .from("staff_users")
    .insert(input)
    .select(STAFF_COLUMNS)
    .single();

  if (inserted.error?.code === "23505") {
    const concurrent = await readStaffProfile(supabase, String(input.auth_user_id));
    if (concurrent?.active) return concurrent;
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
    .select(STAFF_COLUMNS)
    .eq("auth_user_id", authUserId)
    .maybeSingle();

  if (error) {
    throw new Error(`Staff lookup failed: ${error.message}`);
  }

  return data ? (data as StaffProfile) : null;
}
