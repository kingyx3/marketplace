import type { Breadcrumb, ErrorEvent } from "@sentry/nextjs";

const SENSITIVE_KEY_PATTERN =
  /authorization|cookie|secret|token|password|client[_-]?secret|access[_-]?key|api[_-]?key|signature|card|email|phone|address|payload|payment[_-]?method/i;
const SAFE_REQUEST_HEADERS = new Set([
  "accept",
  "content-type",
  "host",
  "user-agent",
  "x-request-id",
]);

export function sentryEnvironment(): string {
  return (
    process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ??
    process.env.VERCEL_ENV ??
    process.env.TARGET_ENV ??
    process.env.NODE_ENV ??
    "unknown"
  );
}

export function sentrySampleRate(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1 ? parsed : fallback;
}

/** Remove credentials, contact details, request bodies, and URL query strings before export. */
export function scrubSentryEvent(event: ErrorEvent): ErrorEvent {
  if (event.user) {
    event.user = event.user.id ? { id: String(event.user.id) } : undefined;
  }

  if (event.request) {
    event.request.cookies = undefined;
    event.request.data = undefined;
    event.request.query_string = undefined;
    if (event.request.url) event.request.url = stripQueryAndFragment(event.request.url);
    if (event.request.headers) {
      event.request.headers = Object.fromEntries(
        Object.entries(event.request.headers).filter(([key]) => SAFE_REQUEST_HEADERS.has(key.toLowerCase()))
      );
    }
  }

  event.extra = sanitizeRecord(event.extra);
  event.contexts = sanitizeRecord(event.contexts) as ErrorEvent["contexts"];
  event.breadcrumbs = event.breadcrumbs?.map(scrubBreadcrumb);
  return event;
}

export function scrubSentryBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb | null {
  return scrubBreadcrumb(breadcrumb);
}

export function sanitizeSentryContext(value: unknown): Record<string, unknown> {
  const sanitized = sanitizeValue(value, 0);
  return sanitized && typeof sanitized === "object" && !Array.isArray(sanitized)
    ? (sanitized as Record<string, unknown>)
    : {};
}

function scrubBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb {
  if (breadcrumb.data) breadcrumb.data = sanitizeRecord(breadcrumb.data);
  if (breadcrumb.data?.url && typeof breadcrumb.data.url === "string") {
    breadcrumb.data.url = stripQueryAndFragment(breadcrumb.data.url);
  }
  return breadcrumb;
}

function sanitizeRecord<T extends Record<string, unknown> | undefined>(value: T): T {
  if (!value) return value;
  return sanitizeValue(value, 0) as T;
}

function sanitizeValue(value: unknown, depth: number): unknown {
  if (depth > 5) return "[truncated]";
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return value.length > 1_000 ? `${value.slice(0, 1_000)}…` : value;
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.slice(0, 25).map((entry) => sanitizeValue(entry, depth + 1));
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .slice(0, 50)
        .map(([key, entry]) => [
          key,
          SENSITIVE_KEY_PATTERN.test(key) ? "[redacted]" : sanitizeValue(entry, depth + 1),
        ])
    );
  }
  return String(value);
}

function stripQueryAndFragment(value: string): string {
  try {
    const url = new URL(value, "https://marketplace.invalid");
    url.search = "";
    url.hash = "";
    return url.origin === "https://marketplace.invalid" ? url.pathname : url.toString();
  } catch {
    return value.split(/[?#]/, 1)[0] ?? value;
  }
}
