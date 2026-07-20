import type { SupabaseClient } from "@supabase/supabase-js";

export type StaffRole = "viewer" | "support" | "catalog" | "operations" | "admin" | "owner";

export interface StaffProfile {
  id: string;
  role: StaffRole;
  active: boolean;
  email?: string | null;
  source?: "database" | "environment";
  created_by_staff_id?: string | null;
  last_seen_at?: string | null;
  permissions?: string[];
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
  auth_user_id: string | null;
  created_by_staff_id: string | null;
  permissions: string[];
}

const STAFF_COLUMNS = "id, role, active, email, source, created_by_staff_id, last_seen_at";

/**
 * Resolve the active operations profile for a signed-in user.
 *
 * Environment allowlisted emails are authoritative owners. Database-managed
 * staff are revalidated against an active normalized-email grant on every
 * request so grant revocation and role changes cannot leave stale access.
 */
export async function resolveAdminStaff(
  supabase: SupabaseClient,
  input: ResolveAdminStaffInput
): Promise<StaffProfile | null> {
  const email = normalizeAdminEmail(input.email);
  const existing = await readStaffProfile(supabase, input.authUserId);

  if (input.environmentAllowlisted) {
    return existing
      ? updateEnvironmentOwner(supabase, existing.id, email)
      : insertStaffProfile(supabase, {
          auth_user_id: input.authUserId,
          email,
          role: "owner",
          active: true,
          source: "environment",
          last_seen_at: new Date().toISOString(),
        });
  }

  if (!email) return null;
  const grant = await readAccessGrant(supabase, email);
  if (!grant?.active) return null;
  if (grant.auth_user_id && grant.auth_user_id !== input.authUserId) return null;

  if (!grant.auth_user_id) {
    await acceptAccessGrant(supabase, grant.id, input.authUserId);
  }

  if (existing) {
    if (!existing.active || existing.source === "environment") return null;
    return synchronizeDelegatedStaff(supabase, existing.id, email, grant);
  }

  const profile = await insertStaffProfile(supabase, {
    auth_user_id: input.authUserId,
    email,
    role: grant.role,
    active: true,
    source: "database",
    created_by_staff_id: grant.created_by_staff_id,
    last_seen_at: new Date().toISOString(),
  });

  return { ...profile, permissions: grant.permissions };
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

async function readAccessGrant(
  supabase: SupabaseClient,
  email: string
): Promise<AccessGrant | null> {
  const result = await supabase
    .from("admin_access_grants")
    .select(
      "id, role, active, auth_user_id, created_by_staff_id, admin_access_grant_permissions(permission_key)"
    )
    .eq("email", email)
    .eq("active", true)
    .maybeSingle();

  if (result.error) {
    throw new Error(`Administrator grant lookup failed: ${result.error.message}`);
  }

  if (!result.data) return null;
  const row = result.data as unknown as Omit<AccessGrant, "permissions"> & {
    admin_access_grant_permissions: Array<{ permission_key: string }> | null;
  };
  return {
    id: row.id,
    role: row.role,
    active: row.active,
    auth_user_id: row.auth_user_id,
    created_by_staff_id: row.created_by_staff_id,
    permissions: (row.admin_access_grant_permissions ?? []).map(
      (permission) => permission.permission_key
    ),
  };
}

async function acceptAccessGrant(
  supabase: SupabaseClient,
  grantId: string,
  authUserId: string
): Promise<void> {
  const accepted = await supabase
    .from("admin_access_grants")
    .update({ auth_user_id: authUserId, accepted_at: new Date().toISOString() })
    .eq("id", grantId)
    .eq("active", true)
    .is("auth_user_id", null)
    .select("id")
    .maybeSingle();

  if (accepted.error) {
    throw new Error(`Administrator grant acceptance failed: ${accepted.error.message}`);
  }
  if (!accepted.data) {
    throw new Error(
      "Administrator grant acceptance failed: grant was accepted by another identity"
    );
  }
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
    throw new Error(
      `Environment owner synchronization failed: ${result.error?.message ?? "row missing"}`
    );
  }

  return result.data as StaffProfile;
}

async function synchronizeDelegatedStaff(
  supabase: SupabaseClient,
  staffId: string,
  email: string,
  grant: AccessGrant
): Promise<StaffProfile> {
  const result = await supabase
    .from("staff_users")
    .update({
      email,
      role: grant.role,
      source: "database",
      created_by_staff_id: grant.created_by_staff_id,
      last_seen_at: new Date().toISOString(),
    })
    .eq("id", staffId)
    .select(STAFF_COLUMNS)
    .single();

  if (result.error || !result.data) {
    throw new Error(
      `Delegated staff synchronization failed: ${result.error?.message ?? "row missing"}`
    );
  }

  return { ...(result.data as StaffProfile), permissions: grant.permissions };
}

async function insertStaffProfile(
  supabase: SupabaseClient,
  input: Record<string, unknown>
): Promise<StaffProfile> {
  const inserted = await supabase.from("staff_users").insert(input).select(STAFF_COLUMNS).single();

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
