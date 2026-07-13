import type { SupabaseClient, User } from "@supabase/supabase-js";
import { conflict, forbidden, unauthorized } from "@/lib/api/errors";
import { setTelemetryUser } from "@/lib/observability";
import { createServiceClient } from "@/lib/supabase";

export interface CustomerRecord {
  id: string;
  auth_user_id: string | null;
  email: string;
  name: string | null;
  phone: string | null;
  segment: string;
  default_currency: string;
  marketing_opt_in: boolean;
  billing_state?: string;
  provisioning_state?: string;
  provisioning_error?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface ApiAuthContext {
  supabase: SupabaseClient;
  user: User;
  roles: string[];
  isAdmin: boolean;
}

export interface ApiCustomerContext extends ApiAuthContext {
  customer: CustomerRecord;
}

export function extractBearerToken(request: Request): string {
  const header = request.headers.get("authorization");
  const match = header?.match(/^Bearer\s+(.+)$/i);
  if (!match?.[1]) {
    throw unauthorized();
  }
  return match[1].trim();
}

export function rolesFromUser(user: Pick<User, "app_metadata">): string[] {
  const metadata = user.app_metadata ?? {};
  const roles = new Set<string>();

  if (typeof metadata.role === "string" && metadata.role.trim()) {
    roles.add(metadata.role.trim());
  }

  if (Array.isArray(metadata.roles)) {
    for (const entry of metadata.roles) {
      if (typeof entry === "string" && entry.trim()) {
        roles.add(entry.trim());
      }
    }
  }

  return [...roles];
}

export function isAdminRole(roles: string[]): boolean {
  return roles.some((role) => ["admin", "ops"].includes(role.toLowerCase()));
}

export async function authenticateApiRequest(
  request: Request,
  supabase: SupabaseClient = createServiceClient()
): Promise<ApiAuthContext> {
  const token = extractBearerToken(request);
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    throw unauthorized();
  }

  const roles = rolesFromUser(data.user);
  setTelemetryUser(data.user.id, roles);
  return {
    supabase,
    user: data.user,
    roles,
    isAdmin: isAdminRole(roles),
  };
}

export async function requireApiAdmin(
  request: Request,
  supabase: SupabaseClient = createServiceClient()
): Promise<ApiAuthContext> {
  const auth = await authenticateApiRequest(request, supabase);
  const staff = await supabase
    .from("staff_users")
    .select("id")
    .eq("auth_user_id", auth.user.id)
    .eq("active", true)
    .maybeSingle();

  if (staff.error) {
    throw new Error(staff.error.message);
  }

  if (!staff.data) {
    throw forbidden("Active staff access required");
  }
  return auth;
}

export async function requireApiCustomer(
  request: Request,
  supabase: SupabaseClient = createServiceClient()
): Promise<ApiCustomerContext> {
  const auth = await authenticateApiRequest(request, supabase);
  const customer = await findOrCreateCustomer(auth.supabase, auth.user);
  return { ...auth, customer };
}

export async function findOrCreateCustomer(
  supabase: SupabaseClient,
  user: User
): Promise<CustomerRecord> {
  const email = user.email?.trim().toLowerCase();
  if (!email) {
    throw unauthorized("Authenticated user must have an email address");
  }

  const byUser = await supabase
    .from("customers")
    .select("*")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (byUser.error) {
    throw new Error(byUser.error.message);
  }
  if (byUser.data) {
    return byUser.data as CustomerRecord;
  }

  const byEmail = await supabase.from("customers").select("*").eq("email", email).maybeSingle();
  if (byEmail.error) {
    throw new Error(byEmail.error.message);
  }

  if (byEmail.data) {
    const existing = byEmail.data as CustomerRecord;
    if (existing.auth_user_id && existing.auth_user_id !== user.id) {
      throw conflict("Email is already linked to another account");
    }

    const updated = await supabase
      .from("customers")
      .update({ auth_user_id: user.id })
      .eq("id", existing.id)
      .select("*")
      .single();
    if (updated.error) {
      throw new Error(updated.error.message);
    }
    return updated.data as CustomerRecord;
  }

  const inserted = await supabase
    .from("customers")
    .insert({
      auth_user_id: user.id,
      email,
      name: displayNameFromUser(user),
    })
    .select("*")
    .single();

  if (inserted.error) {
    if (inserted.error.code === "23505") {
      return findOrCreateCustomer(supabase, user);
    }
    throw new Error(inserted.error.message);
  }

  return inserted.data as CustomerRecord;
}

function displayNameFromUser(user: User): string | null {
  const name = user.user_metadata?.full_name ?? user.user_metadata?.name;
  return typeof name === "string" && name.trim() ? name.trim() : null;
}
