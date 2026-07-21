import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

const nonPersistentAuth = {
  persistSession: false,
  autoRefreshToken: false,
  detectSessionInUrl: false,
} as const;

interface SupabaseSecretEnvironment {
  SUPABASE_SECRET_KEY?: string;
  [key: string]: string | undefined;
}

/**
 * Publishable-key database client for server-side public and RLS-scoped reads.
 * Browser code must use the same-origin application API instead of importing this module.
 */
export function createPublishableClient(): SupabaseClient {
  assertServerOnly("createPublishableClient");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Supabase is not configured (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)"
    );
  }
  return createClient(url, key, { auth: nonPersistentAuth });
}

/** Normalize the canonical server-only Supabase secret key. */
export function resolveSupabaseSecretKey(
  env: SupabaseSecretEnvironment = process.env
): string {
  return env.SUPABASE_SECRET_KEY?.trim() || "";
}

/**
 * Secret-key database client. This bypasses RLS and is restricted to trusted
 * server-side repositories, services, route handlers, jobs, and webhooks.
 */
export function createSecretClient(): SupabaseClient {
  assertServerOnly("createSecretClient");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = resolveSupabaseSecretKey();
  if (!url || !key) {
    throw new Error("Supabase secret key is not configured (SUPABASE_SECRET_KEY)");
  }
  return createClient(url, key, { auth: nonPersistentAuth });
}

/** Shared server-only name used by existing application services. */
export const createAnonClient = createPublishableClient;

/** Shared server-only name used by existing privileged application services. */
export const createServiceClient = createSecretClient;

/**
 * Cookie-backed client for Server Components, Route Handlers, and Server Actions.
 * It uses the publishable key and the authenticated user's cookie session, so RLS
 * remains active for user-scoped operations.
 */
export async function createUserClient(): Promise<SupabaseClient> {
  assertServerOnly("createUserClient");
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
          // Server Components cannot set cookies. Middleware refreshes sessions
          // for normal page traffic; Route Handlers can set them.
        }
      },
    },
  }) as unknown as SupabaseClient;
}

function assertServerOnly(operation: string): void {
  if (typeof window !== "undefined") {
    throw new Error(`${operation} is server-only; browser data access must use /api endpoints`);
  }
}
