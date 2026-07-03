import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Anonymous (RLS-enforced) client for public catalog reads and
 * user-scoped queries. Safe to use in Server Components.
 */
export function createAnonClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error(
      "Supabase is not configured (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY)"
    );
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

/**
 * Service-role client. Bypasses RLS — server-side only, never import
 * from client components. Used by webhooks and admin operations.
 */
export function createServiceClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Supabase service role is not configured (SUPABASE_SERVICE_ROLE_KEY)");
  }
  return createClient(url, key, { auth: { persistSession: false } });
}
