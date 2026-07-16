const EMAIL_PATTERN = /^[^,\s@]+@[^,\s@]+\.[^,\s@]+$/;

/**
 * Parse the server-only, comma-separated admin email allowlist.
 * Any malformed entry invalidates the full list so authorization fails closed.
 */
export function parseAdminEmailAllowlist(value: string | undefined): ReadonlySet<string> {
  if (!value?.trim()) return new Set();

  const emails = value.split(",").map(normalizeEmail);
  if (emails.some((email) => !email || !EMAIL_PATTERN.test(email))) {
    return new Set();
  }

  return new Set(emails);
}

export function isAdminEmailAllowed(
  email: string | null | undefined,
  value = process.env.ADMIN_EMAIL_ALLOWLIST
): boolean {
  const normalizedEmail = normalizeEmail(email ?? "");
  if (!EMAIL_PATTERN.test(normalizedEmail)) return false;
  return parseAdminEmailAllowlist(value).has(normalizedEmail);
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}
