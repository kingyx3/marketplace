import { serverEnvSchema, type ServerEnv } from "./env-contract.generated";

let cached: ServerEnv | null = null;

/** Parse and cache the generated runtime environment contract. */
export function getEnv(): ServerEnv {
  if (cached) return cached;
  const result = serverEnvSchema.safeParse(process.env);
  if (!result.success) {
    const missing = result.error.issues.map((issue) => issue.path.join(".")).join(", ");
    throw new Error(`Invalid or missing environment variables: ${missing}`);
  }
  cached = result.data;
  return cached;
}

/** True when the public Supabase variables are present (used to degrade gracefully in dev). */
export function hasSupabasePublicEnv(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  );
}
