import type { User } from "@supabase/supabase-js";

export function isFreshSignup(
  user: Pick<User, "created_at">,
  now = new Date(),
  maxAgeMs = 10 * 60 * 1000
): boolean {
  const createdAt = Date.parse(user.created_at);
  if (!Number.isFinite(createdAt)) return false;

  const ageMs = now.getTime() - createdAt;
  return ageMs >= 0 && ageMs <= maxAgeMs;
}

export function appendWelcomeParam(path: string): string {
  const url = new URL(path, "https://local.invalid");
  url.searchParams.set("welcome", "1");
  return `${url.pathname}${url.search}${url.hash}`;
}
