import type { User } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { cache } from "react";

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

export interface StaffProfile {
  id: string;
  role: "staff" | "admin" | "owner";
  active: boolean;
}

export interface CurrentViewer {
  user: AuthUser | null;
  staff: StaffProfile | null;
  staffLookup: "not_applicable" | "resolved" | "unavailable";
}

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

export const getCurrentViewer = cache(async (): Promise<CurrentViewer> => {
  const user = await getCurrentUser();
  if (!user) {
    return { user: null, staff: null, staffLookup: "not_applicable" };
  }

  try {
    return {
      user,
      staff: await getActiveStaff(user.id),
      staffLookup: "resolved",
    };
  } catch (error) {
    console.error("navigation staff lookup failed:", safeErrorMessage(error));
    return { user, staff: null, staffLookup: "unavailable" };
  }
});

export async function requireUser(next = "/account"): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (!user) {
    redirect(`/sign-in?next=${encodeURIComponent(next)}`);
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
  const viewer = await getCurrentViewer();
  if (!viewer.user) {
    redirect(`/sign-in?next=${encodeURIComponent(next)}`);
  }

  if (viewer.staffLookup === "unavailable") {
    throw new Error("Staff authorization is temporarily unavailable");
  }

  if (!viewer.staff) {
    redirect("/access-denied");
  }

  return { user: viewer.user, staff: viewer.staff };
}

async function getActiveStaff(authUserId: string): Promise<StaffProfile | null> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("staff_users")
    .select("id, role, active")
    .eq("auth_user_id", authUserId)
    .eq("active", true)
    .maybeSingle();

  if (error) {
    throw new Error(`Staff lookup failed: ${error.message}`);
  }

  return data ? (data as StaffProfile) : null;
}

function safeErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "unknown";
}
