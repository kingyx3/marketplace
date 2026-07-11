import { describe, expect, it } from "vitest";
import { NextResponse } from "next/server";
import { badRequest, toErrorResponse } from "@/lib/api/errors";
import {
  requestIdFrom,
  sanitizeLogValue,
  withRequestId,
} from "@/lib/observability";

describe("observability helpers", () => {
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
});
