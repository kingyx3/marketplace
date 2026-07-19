export const apiErrorCodes = [
  "bad_request",
  "validation_failed",
  "unauthorized",
  "forbidden",
  "not_found",
  "conflict",
  "payload_too_large",
  "unsupported_media_type",
  "rate_limited",
  "request_timeout",
  "service_unavailable",
  "internal_error",
] as const;

export type ApiErrorCode = (typeof apiErrorCodes)[number];

export interface ApiFieldError {
  path: string;
  message: string;
}

export interface ApiErrorPayload {
  error: {
    code: string;
    message: string;
    requestId: string;
    retryable: boolean;
    fields?: ApiFieldError[];
  };
}

export interface ApiRequestMetadata {
  requestId?: string;
  idempotencyKey?: string;
}

export function isApiErrorPayload(value: unknown): value is ApiErrorPayload {
  if (!value || typeof value !== "object") return false;
  const error = (value as { error?: unknown }).error;
  if (!error || typeof error !== "object") return false;

  const candidate = error as Record<string, unknown>;
  return (
    typeof candidate.code === "string" &&
    typeof candidate.message === "string" &&
    typeof candidate.requestId === "string" &&
    typeof candidate.retryable === "boolean"
  );
}
