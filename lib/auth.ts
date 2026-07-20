import type { User } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { cache } from "react";

import { isAdminEmailAllowed } from "@/lib/admin-email-allowlist";
import { resolveAdminStaff, type StaffProfile } from "@/lib/admin-staff";
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

export interface CurrentViewer {
  user: AuthUser | null;
  staff: StaffProfile | null;
  staffLookup: "not_applicable" | "resolved" | "unavailable";
}

export interface CustomerProfile {
  id: string;
  email: string;
  name: string | null;
  default_currency?: string;
  marketing_opt_in?: boolean;
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
      staff: await resolveAdminStaff(createServiceClient(), {
        authUserId: user.id,
        email: user.email,
        environmentAllowlisted: isAdminEmailAllowed(user.email),
      }),
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
    .select(
      "id, email, name, default_currency, marketing_opt_in, provisioning_state, provisioning_error"
    )
    .eq("auth_user_id", authUserId)
    .is("deleted_at", null)
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
      default_currency: customer.default_currency,
      marketing_opt_in: customer.marketing_opt_in,
      provisioning_state: customer.provisioning_state ?? "active",
      provisioning_error: customer.provisioning_error ?? null,
    } satisfies CustomerProfile,
  };
}

export async function requireStaff(next = "/control") {
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

function safeErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "unknown";
}
