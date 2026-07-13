import { describe, expect, it } from "vitest";
import {
  parseSampleRate,
  sanitizeTelemetryAttributes,
  sanitizeTelemetryText,
  scrubSentryBreadcrumb,
  scrubSentryEvent,
} from "@/lib/telemetry";

describe("Sentry telemetry privacy", () => {
  it("uses only valid sample rates", () => {
    expect(parseSampleRate("0.25", 0.1)).toBe(0.25);
    expect(parseSampleRate("2", 0.1)).toBe(0.1);
    expect(parseSampleRate("not-a-number", 0.1)).toBe(0.1);
  });

  it("removes request bodies, credentials, IP headers, and query strings", () => {
    expect(
      scrubSentryEvent({
        request: {
          url: "https://marketplace.example/orders?token=secret#private",
          headers: {
            authorization: "Bearer secret",
            cookie: "session=secret",
            "x-forwarded-for": "203.0.113.10",
            accept: "application/json",
          },
          cookies: { session: "secret" },
          data: { card: "4242" },
        },
        user: { id: "user-1", email: "buyer@example.test", ip_address: "203.0.113.10" },
      })
    ).toEqual({
      request: {
        url: "https://marketplace.example/orders",
        headers: { accept: "application/json" },
      },
      user: { id: "user-1" },
      logentry: undefined,
      exception: undefined,
    });
  });

  it("redacts sensitive values embedded inside error text", () => {
    const text = sanitizeTelemetryText(
      "Checkout failed for buyer@example.test from 203.0.113.10 using Bearer abc.def-123 and sk_live_abc123456"
    );

    expect(text).not.toContain("buyer@example.test");
    expect(text).not.toContain("203.0.113.10");
    expect(text).not.toContain("abc.def-123");
    expect(text).not.toContain("sk_live_abc123456");

    expect(
      scrubSentryEvent({
        message: "Failed for buyer@example.test",
        exception: {
          values: [{ type: "Error", value: "Provider rejected sk_test_abc123456" }],
        },
      })
    ).toEqual({
      message: "Failed for [redacted-email]",
      logentry: undefined,
      exception: {
        values: [{ type: "Error", value: "Provider rejected [redacted-secret]" }],
      },
      user: undefined,
    });
  });

  it("redacts structured log attributes and breadcrumbs", () => {
    expect(
      sanitizeTelemetryAttributes({
        orderId: "order-1",
        customer: { email: "buyer@example.test", status: "active" },
      })
    ).toEqual({
      orderId: "order-1",
      customer: JSON.stringify({ email: "[redacted]", status: "active" }),
    });

    expect(
      scrubSentryBreadcrumb({
        category: "checkout",
        message: "Failed for buyer@example.test",
        data: { client_secret: "secret", orderId: "order-1" },
      })
    ).toEqual({
      category: "checkout",
      message: "Failed for [redacted-email]",
      data: { client_secret: "[redacted]", orderId: "order-1" },
    });
  });
});
