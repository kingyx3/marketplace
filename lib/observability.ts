import { randomUUID } from "node:crypto";
import * as Sentry from "@sentry/nextjs";
import { NextResponse } from "next/server";
import {
  sanitizeTelemetryAttributes,
  sanitizeTelemetryValue,
  sentryEnvironment,
} from "@/lib/telemetry";

const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;

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

export function setTelemetryUser(userId: string | null, roles: string[] = []): void {
  Sentry.setUser(userId ? { id: userId } : null);
  if (roles.length > 0) Sentry.setTag("auth.roles", roles.slice(0, 10).join(","));
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

  Sentry.withScope((scope) => {
    scope.setLevel("error");
    scope.setTag("marketplace.event", event);
    attachScopeContext(scope, context);
    Sentry.captureException(normalizeError(error));
  });
}

export function sanitizeLogValue(value: unknown, depth = 0): unknown {
  return sanitizeTelemetryValue(value, depth);
}

function writeLog(level: "info" | "warn" | "error", event: string, context: LogContext): void {
  const sanitized = sanitizeTelemetryValue(context);
  const sanitizedContext =
    sanitized && typeof sanitized === "object" && !Array.isArray(sanitized)
      ? (sanitized as Record<string, unknown>)
      : {};
  const record = {
    timestamp: new Date().toISOString(),
    level,
    event,
    service: "marketplace",
    environment: sentryEnvironment(),
    ...sanitizedContext,
  };
  const line = JSON.stringify(record);
  const attributes = sanitizeTelemetryAttributes({
    service: "marketplace",
    environment: sentryEnvironment(),
    ...sanitizedContext,
  });

  if (level === "error") {
    Sentry.logger.error(event, attributes, {});
    console.error(line);
  } else if (level === "warn") {
    Sentry.logger.warn(event, attributes, {});
    console.warn(line);
  } else {
    Sentry.logger.info(event, attributes, {});
    console.info(line);
  }
}

interface TelemetryScope {
  setContext(name: string, context: Record<string, unknown>): void;
  setTag(key: string, value: string): void;
}

function attachScopeContext(scope: TelemetryScope, context: LogContext): void {
  const sanitized = sanitizeTelemetryValue(context);
  if (sanitized && typeof sanitized === "object" && !Array.isArray(sanitized)) {
    scope.setContext("marketplace", sanitized as Record<string, unknown>);
  }
  if (context.requestId) scope.setTag("request.id", context.requestId);
  if (context.route) scope.setTag("http.route", context.route);
  if (context.method) scope.setTag("http.request.method", context.method);
  if (context.status !== undefined) scope.setTag("http.response.status_code", String(context.status));
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

function normalizeError(error: unknown): Error {
  if (error instanceof Error) return error;
  return new Error(typeof error === "string" ? error : "Unknown application error");
}
