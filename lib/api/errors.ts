import { NextResponse } from "next/server";
import { ZodError } from "zod";

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
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

export function serviceUnavailable(message = "Service unavailable"): ApiError {
  return new ApiError(503, "service_unavailable", message);
}

export function internalError(message = "Internal server error"): ApiError {
  return new ApiError(500, "internal_error", message);
}

export function toErrorResponse(error: unknown): NextResponse {
  if (error instanceof ApiError) {
    return NextResponse.json(
      { error: { code: error.code, message: error.message } },
      { status: error.status }
    );
  }

  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        error: {
          code: "validation_failed",
          message: "Invalid request body",
          fields: error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        },
      },
      { status: 400 }
    );
  }

  console.error("Unhandled API error:", error instanceof Error ? error.message : "unknown");
  return NextResponse.json(
    { error: { code: "internal_error", message: "Internal server error" } },
    { status: 500 }
  );
}

