import type { User } from "@supabase/supabase-js";
import { redirect } from "next/navigation";

import { findOrCreateCustomer } from "@/lib/api/auth";
import { createServiceClient, createUserClient } from "@/lib/supabase";

export class AuthenticationError extends Error {
  constructor(message = "Authentication required") {
    super(message);
    this.name = "AuthenticationError";
  }
}

export class AuthorizationError extends Error {
  constructor(message = "Staff access required") {
    super(message);
    this.name = "AuthorizationError";
  }
}

export type AuthUser = User;

export interface CustomerProfile {
  id: string;
  email: string;
  name: string | null;
  billing_state: string;
  provisioning_state: string;
  provisioning_error: string | null;
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  let supabase;
  try {
    supabase = await createUserClient();
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Supabase is not configured")) {
      return null;
    }
    throw error;
  }

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return null;
  }

  return user;
}

export async function requireUser(next = "/account"): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (!user) {
    redirect(`/auth/sign-in?next=${encodeURIComponent(next)}`);
  }
  return user;
}

export async function getCustomerProfile(authUserId: string): Promise<CustomerProfile | null> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("customers")
    .select("id, email, name, billing_state, provisioning_state, provisioning_error")
    .eq("auth_user_id", authUserId)
    .maybeSingle();

  if (error) {
    throw new Error(`Customer lookup failed: ${error.message}`);
  }

  return data as CustomerProfile | null;
}

export async function requireCustomer(next = "/account") {
  const user = await requireUser(next);
  const customer = await findOrCreateCustomer(createServiceClient(), user);

  return {
    user,
    customer: {
      id: customer.id,
      email: customer.email,
      name: customer.name,
      billing_state: customer.billing_state ?? "unpaid",
      provisioning_state: customer.provisioning_state ?? "active",
      provisioning_error: customer.provisioning_error ?? null,
    } satisfies CustomerProfile,
  };
}

export async function requireStaff(next = "/admin") {
  const user = await requireUser(next);
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("staff_users")
    .select("id, role, active")
    .eq("auth_user_id", user.id)
    .eq("active", true)
    .maybeSingle();

  if (error) {
    throw new Error(`Staff lookup failed: ${error.message}`);
  }

  if (!data) {
    throw new AuthorizationError();
  }

  return { user, staff: data as { id: string; role: "staff" | "admin" | "owner"; active: boolean } };
}
