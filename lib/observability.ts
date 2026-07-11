import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;
const SENSITIVE_KEY_PATTERN =
  /authorization|cookie|secret|token|password|client[_-]?secret|access[_-]?key|api[_-]?key|signature|card|email|phone|address|payload/i;

export interface LogContext {
  requestId?: string;
  route?: string;
  method?: string;
  userId?: string;
  orderId?: string;
  preorderId?: string;
  paymentId?: string;
  eventId?: string;
  eventType?: string;
  status?: string | number;
  durationMs?: number;
  [key: string]: unknown;
}

export function requestIdFrom(request: Request): string {
  const candidate = request.headers.get("x-request-id")?.trim();
  return candidate && REQUEST_ID_PATTERN.test(candidate) ? candidate : randomUUID();
}

export function withRequestId<T extends NextResponse>(response: T, requestId: string): T {
  response.headers.set("x-request-id", requestId);
  return response;
}

export function logInfo(event: string, context: LogContext = {}): void {
  writeLog("info", event, context);
}

export function logWarn(event: string, context: LogContext = {}): void {
  writeLog("warn", event, context);
}

export function logError(event: string, error: unknown, context: LogContext = {}): void {
  writeLog("error", event, {
    ...context,
    error: safeError(error),
  });
}

export function sanitizeLogValue(value: unknown, depth = 0): unknown {
  if (depth > 4) return "[truncated]";
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return value.length > 500 ? `${value.slice(0, 500)}…` : value;
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) {
    return value.slice(0, 25).map((entry) => sanitizeLogValue(entry, depth + 1));
  }
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .slice(0, 50)
        .map(([key, entry]) => [
          key,
          SENSITIVE_KEY_PATTERN.test(key) ? "[redacted]" : sanitizeLogValue(entry, depth + 1),
        ])
    );
  }
  return String(value);
}

function writeLog(level: "info" | "warn" | "error", event: string, context: LogContext): void {
  const sanitized = sanitizeLogValue(context);
  const sanitizedContext =
    sanitized && typeof sanitized === "object" && !Array.isArray(sanitized)
      ? (sanitized as Record<string, unknown>)
      : {};
  const record = {
    timestamp: new Date().toISOString(),
    level,
    event,
    service: "marketplace",
    environment:
      process.env.VERCEL_ENV ?? process.env.TARGET_ENV ?? process.env.NODE_ENV ?? "unknown",
    ...sanitizedContext,
  };
  const line = JSON.stringify(record);

  if (level === "error") {
    console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else {
    console.info(line);
  }
}

function safeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      code:
        "code" in error && typeof (error as { code?: unknown }).code === "string"
          ? (error as { code: string }).code
          : undefined,
    };
  }

  return { message: typeof error === "string" ? error : "unknown error" };
}
