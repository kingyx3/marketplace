import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { ZodError } from "zod";

import type { ApiErrorCode, ApiFieldError, ApiErrorPayload } from "@/lib/api/contracts";
import { logError, logWarn, withRequestId, type LogContext } from "@/lib/observability";

export class ApiError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode | string;
  readonly retryable: boolean;
  readonly retryAfterSeconds?: number;

  constructor(
    status: number,
    code: ApiErrorCode | string,
    message: string,
    options: { retryable?: boolean; retryAfterSeconds?: number } = {}
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.retryable = options.retryable ?? defaultRetryable(status);
    this.retryAfterSeconds = options.retryAfterSeconds;
  }
}

export function badRequest(message = "Invalid request"): ApiError {
  return new ApiError(400, "bad_request", message);
}

export function unauthorized(message = "Authentication required"): ApiError {
  return new ApiError(401, "unauthorized", message);
}

export function forbidden(message = "Forbidden"): ApiError {
  return new ApiError(403, "forbidden", message);
}

export function notFound(message = "Not found"): ApiError {
  return new ApiError(404, "not_found", message);
}

export function conflict(message = "Conflict"): ApiError {
  return new ApiError(409, "conflict", message);
}

export function payloadTooLarge(message = "Request body is too large"): ApiError {
  return new ApiError(413, "payload_too_large", message);
}

export function unsupportedMediaType(message = "Content-Type must be application/json"): ApiError {
  return new ApiError(415, "unsupported_media_type", message);
}

export function rateLimited(message = "Too many requests", retryAfterSeconds = 60): ApiError {
  return new ApiError(429, "rate_limited", message, {
    retryable: true,
    retryAfterSeconds,
  });
}

export function requestTimeout(message = "Request timed out"): ApiError {
  return new ApiError(504, "request_timeout", message, { retryable: true });
}

export function serviceUnavailable(message = "Service unavailable"): ApiError {
  return new ApiError(503, "service_unavailable", message, { retryable: true });
}

export function internalError(message = "Internal server error"): ApiError {
  return new ApiError(500, "internal_error", message, { retryable: false });
}

export function toErrorResponse(error: unknown, context: LogContext = {}): NextResponse {
  const requestId = context.requestId ?? randomUUID();
  const responseContext = { ...context, requestId };

  if (error instanceof ApiError) {
    if (error.status >= 500) {
      logError("api.request.failed", error, {
        ...responseContext,
        status: error.status,
        errorCode: error.code,
        retryable: error.retryable,
      });
    } else {
      logWarn("api.request.rejected", {
        ...responseContext,
        status: error.status,
        errorCode: error.code,
        retryable: error.retryable,
      });
    }

    return errorResponse(
      {
        error: {
          code: error.code,
          message: error.message,
          requestId,
          retryable: error.retryable,
        },
      },
      error.status,
      requestId,
      error.retryAfterSeconds
    );
  }

  if (error instanceof ZodError) {
    const fields: ApiFieldError[] = error.issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message,
    }));
    logWarn("api.request.validation_failed", {
      ...responseContext,
      status: 400,
      issueCount: fields.length,
      issuePaths: fields.map((field) => field.path).filter(Boolean),
    });
    return errorResponse(
      {
        error: {
          code: "validation_failed",
          message: "Invalid request body",
          requestId,
          retryable: false,
          fields,
        },
      },
      400,
      requestId
    );
  }

  logError("api.request.unhandled_error", error, {
    ...responseContext,
    status: 500,
    retryable: false,
  });
  return errorResponse(
    {
      error: {
        code: "internal_error",
        message: "Internal server error",
        requestId,
        retryable: false,
      },
    },
    500,
    requestId
  );
}

function errorResponse(
  payload: ApiErrorPayload,
  status: number,
  requestId: string,
  retryAfterSeconds?: number
): NextResponse {
  const response = withRequestId(NextResponse.json(payload, { status }), requestId);
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("X-Content-Type-Options", "nosniff");
  if (retryAfterSeconds !== undefined) {
    response.headers.set("Retry-After", String(Math.max(1, Math.ceil(retryAfterSeconds))));
  }
  return response;
}

function defaultRetryable(status: number): boolean {
  return status === 429 || status === 502 || status === 503 || status === 504;
}
