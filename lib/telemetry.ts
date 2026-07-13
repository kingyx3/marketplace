const SENSITIVE_KEY_PATTERN =
  /authorization|cookie|secret|token|password|client[_-]?secret|access[_-]?key|api[_-]?key|signature|card|email|phone|address|payload|body|query/i;
const SENSITIVE_HEADER_PATTERN =
  /authorization|cookie|set-cookie|x-api-key|x-forwarded-for|x-real-ip|cf-connecting-ip/i;

export type TelemetryPrimitive = string | number | boolean;

export function sentryEnvironment(): string {
  return (
    process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ??
    process.env.SENTRY_ENVIRONMENT ??
    process.env.VERCEL_ENV ??
    process.env.TARGET_ENV ??
    process.env.NODE_ENV ??
    "unknown"
  );
}

export function sentryRelease(): string | undefined {
  return process.env.SENTRY_RELEASE ?? process.env.VERCEL_GIT_COMMIT_SHA ?? undefined;
}

export function parseSampleRate(value: string | undefined, fallback: number): number {
  if (!value?.trim()) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1 ? parsed : fallback;
}

export function defaultTraceSampleRate(): number {
  return sentryEnvironment() === "production" ? 0.1 : 1;
}

export function sanitizeTelemetryValue(value: unknown, depth = 0): unknown {
  if (depth > 4) return "[truncated]";
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return value.length > 500 ? `${value.slice(0, 500)}…` : value;
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) {
    return value.slice(0, 25).map((entry) => sanitizeTelemetryValue(entry, depth + 1));
  }
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .slice(0, 50)
        .map(([key, entry]) => [
          key,
          SENSITIVE_KEY_PATTERN.test(key)
            ? "[redacted]"
            : sanitizeTelemetryValue(entry, depth + 1),
        ])
    );
  }
  return String(value);
}

export function sanitizeTelemetryAttributes(
  value: Record<string, unknown>
): Record<string, TelemetryPrimitive> {
  const sanitized = sanitizeTelemetryValue(value);
  if (!sanitized || typeof sanitized !== "object" || Array.isArray(sanitized)) return {};

  return Object.fromEntries(
    Object.entries(sanitized as Record<string, unknown>).map(([key, entry]) => [
      key,
      typeof entry === "string" || typeof entry === "number" || typeof entry === "boolean"
        ? entry
        : JSON.stringify(entry),
    ])
  );
}

export function scrubSentryEvent<T extends object>(event: T): T {
  const output = { ...(event as Record<string, unknown>) };
  const request = objectValue(output.request);

  if (request) {
    const sanitizedRequest = { ...request };
    const headers = objectValue(request.headers);
    if (headers) {
      sanitizedRequest.headers = Object.fromEntries(
        Object.entries(headers)
          .filter(([key]) => !SENSITIVE_HEADER_PATTERN.test(key))
          .map(([key, value]) => [key, sanitizeTelemetryValue(value)])
      );
    }
    if (typeof request.url === "string") sanitizedRequest.url = stripUrlQuery(request.url);
    delete sanitizedRequest.cookies;
    delete sanitizedRequest.data;
    delete sanitizedRequest.query_string;
    output.request = sanitizedRequest;
  }

  const user = objectValue(output.user);
  output.user = user && typeof user.id === "string" ? { id: user.id } : undefined;

  if (output.extra) output.extra = sanitizeTelemetryValue(output.extra);
  if (output.contexts) output.contexts = sanitizeTelemetryValue(output.contexts);
  if (output.tags) output.tags = sanitizeTelemetryValue(output.tags);

  return output as T;
}

export function scrubSentryBreadcrumb<T extends object>(breadcrumb: T): T {
  const output = { ...(breadcrumb as Record<string, unknown>) };
  if (output.data) output.data = sanitizeTelemetryValue(output.data);
  if (typeof output.message === "string" && output.message.length > 500) {
    output.message = `${output.message.slice(0, 500)}…`;
  }
  return output as T;
}

function objectValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function stripUrlQuery(value: string): string {
  try {
    const url = new URL(value);
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return value.split(/[?#]/, 1)[0] ?? value;
  }
}
