import { randomUUID } from "node:crypto";
import * as Sentry from "@sentry/nextjs";
import { NextResponse } from "next/server";

import { sanitizeSentryContext } from "@/lib/sentry-config";

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
  writeSentryLog("info", event, context);
}

export function logWarn(event: string, context: LogContext = {}): void {
  writeLog("warn", event, context);
  writeSentryLog("warn", event, context);
}

export function logError(event: string, error: unknown, context: LogContext = {}): void {
  writeLog("error", event, {
    ...context,
    error: safeError(error),
  });
  captureHandledError(event, error, context);
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

function writeSentryLog(level: "info" | "warn", event: string, context: LogContext): void {
  try {
    const attributes = sentryLogAttributes(context);
    if (level === "warn") Sentry.logger.warn(event, attributes);
    else Sentry.logger.info(event, attributes);
  } catch {
    // Telemetry must never make an application path fail.
  }
}

function captureHandledError(event: string, error: unknown, context: LogContext): void {
  try {
    const sanitizedContext = sanitizeSentryContext(context);
    Sentry.logger.error(event, sentryLogAttributes({ ...context, error: safeError(error) }));
    Sentry.withScope((scope) => {
      scope.setTag("application_event", event);
      for (const [key, value] of [
        ["route", context.route],
        ["method", context.method],
        ["event_type", context.eventType],
        ["status", context.status],
        ["request_id", context.requestId],
      ] as const) {
        if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
          scope.setTag(key, String(value));
        }
      }
      if (context.userId) scope.setUser({ id: context.userId });
      scope.setContext("marketplace", sanitizedContext);
      Sentry.captureException(normalizeError(error));
    });
  } catch {
    // Telemetry must never make an application path fail.
  }
}

function sentryLogAttributes(context: LogContext): Record<string, string | number | boolean> {
  const sanitized = sanitizeSentryContext(context);
  return Object.fromEntries(
    Object.entries(sanitized).map(([key, value]) => {
      if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
        return [key, value];
      }
      return [key, JSON.stringify(value)];
    })
  );
}

function normalizeError(error: unknown): Error {
  if (error instanceof Error) return error;
  return new Error(typeof error === "string" ? error : "Unknown application error");
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
