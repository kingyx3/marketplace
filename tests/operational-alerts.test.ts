import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { sendOperationalAlert } from "@/lib/operational-alerts";

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.OPERATIONAL_ALERT_WEBHOOK_URL;
  delete process.env.OPERATIONAL_ALERT_WEBHOOK_SECRET;
  delete process.env.TARGET_ENV;
});

describe("operational alert delivery", () => {
  it("signs privacy-safe alert payloads", async () => {
    process.env.TARGET_ENV = "production";
    process.env.OPERATIONAL_ALERT_WEBHOOK_URL = "https://alerts.example.test/marketplace";
    process.env.OPERATIONAL_ALERT_WEBHOOK_SECRET = "alert-secret";
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = String(init?.body ?? "");
      const headers = init?.headers as Record<string, string>;
      expect(headers["x-marketplace-signature"]).toBe(
        `sha256=${createHmac("sha256", "alert-secret").update(body).digest("hex")}`
      );
      const parsed = JSON.parse(body);
      expect(parsed.event).toBe("hitpay.webhook.processing_failed");
      expect(parsed.context).toEqual({
        requestId: "request-12345678",
        orderId: "order-1",
        email: "[redacted]",
        authorization: "[redacted]",
      });
      return new Response("ok", { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      sendOperationalAlert({
        event: "hitpay.webhook.processing_failed",
        summary: "Webhook processing failed",
        severity: "critical",
        context: {
          requestId: "request-12345678",
          orderId: "order-1",
          email: "buyer@example.test",
          authorization: "Bearer private",
        },
      })
    ).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("fails closed when production has no alert destination", async () => {
    process.env.TARGET_ENV = "production";

    await expect(
      sendOperationalAlert({
        event: "test",
        summary: "test",
        severity: "warning",
      })
    ).rejects.toThrow("OPERATIONAL_ALERT_WEBHOOK_URL is not configured");
  });

  it("allows local development without an external alert provider", async () => {
    process.env.TARGET_ENV = "development";

    await expect(
      sendOperationalAlert({
        event: "test",
        summary: "test",
        severity: "warning",
      })
    ).resolves.toBeUndefined();
  });
});
