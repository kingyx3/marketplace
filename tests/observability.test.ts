import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const scope = {
    setLevel: vi.fn(),
    setTag: vi.fn(),
    setContext: vi.fn(),
  };

  return {
    captureException: vi.fn(),
    loggerError: vi.fn(),
    loggerInfo: vi.fn(),
    loggerWarn: vi.fn(),
    scope,
    setTag: vi.fn(),
    setUser: vi.fn(),
  };
});

vi.mock("@sentry/nextjs", () => ({
  captureException: mocks.captureException,
  logger: {
    error: mocks.loggerError,
    info: mocks.loggerInfo,
    warn: mocks.loggerWarn,
  },
  setTag: mocks.setTag,
  setUser: mocks.setUser,
  withScope: (callback: (scope: typeof mocks.scope) => void) => callback(mocks.scope),
}));

import { NextResponse } from "next/server";
import { badRequest, toErrorResponse } from "@/lib/api/errors";
import {
  logError,
  requestIdFrom,
  sanitizeLogValue,
  withRequestId,
} from "@/lib/observability";

describe("observability helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("preserves a valid upstream request id", () => {
    const request = new Request("https://example.test", {
      headers: { "x-request-id": "request-12345678" },
    });

    expect(requestIdFrom(request)).toBe("request-12345678");
  });

  it("replaces an invalid request id", () => {
    const request = new Request("https://example.test", {
      headers: { "x-request-id": "bad id" },
    });

    expect(requestIdFrom(request)).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("adds the request id to responses", () => {
    const response = withRequestId(NextResponse.json({ ok: true }), "request-12345678");
    expect(response.headers.get("x-request-id")).toBe("request-12345678");
  });

  it("redacts sensitive keys recursively", () => {
    expect(
      sanitizeLogValue({
        orderId: "order-1",
        authorization: "Bearer secret",
        customer: {
          email: "buyer@example.test",
          phone: "+6500000000",
          status: "active",
        },
        payment: {
          client_secret: "pi_secret",
          amountCents: 1000,
        },
      })
    ).toEqual({
      orderId: "order-1",
      authorization: "[redacted]",
      customer: {
        email: "[redacted]",
        phone: "[redacted]",
        status: "active",
      },
      payment: {
        client_secret: "[redacted]",
        amountCents: 1000,
      },
    });
  });

  it("correlates API error responses without exposing internals", async () => {
    const response = toErrorResponse(badRequest("Invalid order"), {
      requestId: "request-12345678",
      route: "/api/checkout",
      method: "POST",
    });

    expect(response.status).toBe(400);
    expect(response.headers.get("x-request-id")).toBe("request-12345678");
    await expect(response.json()).resolves.toEqual({
      error: { code: "bad_request", message: "Invalid order" },
    });
  });

  it("preserves structured Supabase errors when reporting to Sentry", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    try {
      logError(
        "catalog.sku_save_failed",
        {
          code: "42702",
          message: 'column reference "sku_id" is ambiguous',
          details: "It could refer to either a PL/pgSQL variable or a table column.",
          hint: "Qualify the intended reference.",
        },
        { route: "/control/operations", operation: "create" }
      );
    } finally {
      consoleError.mockRestore();
    }

    expect(mocks.captureException).toHaveBeenCalledTimes(1);
    const captured = mocks.captureException.mock.calls[0]?.[0] as Error & {
      code?: string;
      details?: string;
      hint?: string;
    };

    expect(captured).toBeInstanceOf(Error);
    expect(captured.message).toBe('column reference "sku_id" is ambiguous');
    expect(captured).toMatchObject({
      code: "42702",
      details: "It could refer to either a PL/pgSQL variable or a table column.",
      hint: "Qualify the intended reference.",
    });
  });
});
