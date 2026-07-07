import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

/**
 * Publishable-key client for public catalog reads and user-scoped queries.
 * Safe to use in Server Components because access is still RLS-enforced.
 */
export function createPublishableClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Supabase is not configured (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)"
    );
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

/**
 * Secret-key client. Bypasses RLS — server-side only, never import from
 * client components. Used by webhooks and admin operations.
 */
export function createSecretClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    throw new Error("Supabase secret key is not configured (SUPABASE_SECRET_KEY)");
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

/** Backwards-compatible alias for older imports. Prefer createPublishableClient. */
export const createAnonClient = createPublishableClient;

/** Backwards-compatible alias for older imports. Prefer createSecretClient. */
export const createServiceClient = createSecretClient;

/**
 * Cookie-backed Supabase client for Server Components, Route Handlers,
 * and Server Actions. Uses the publishable key plus httpOnly auth cookies,
 * so RLS still applies for user-scoped reads.
 */
export async function createUserClient(): Promise<SupabaseClient> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Supabase is not configured (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)"
    );
  }

  const cookieStore = await cookies();

  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Server Components cannot set cookies. Middleware refreshes
          // sessions for normal page traffic; Route Handlers can set them.
        }
      },
    },
  }) as unknown as SupabaseClient;
}
