import { describe, expect, it } from "vitest";
import {
  parseSampleRate,
  sanitizeTelemetryAttributes,
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
        data: { client_secret: "secret", orderId: "order-1" },
      })
    ).toEqual({
      category: "checkout",
      data: { client_secret: "[redacted]", orderId: "order-1" },
    });
  });
});
