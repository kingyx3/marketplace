import { describe, expect, it, vi } from "vitest";
import { collectReadiness, shallowHealth } from "@/lib/readiness";

describe("health and readiness", () => {
  it("keeps shallow health dependency-free", () => {
    expect(shallowHealth(new Date("2026-07-04T12:00:00.000Z"))).toEqual({
      status: "ok",
      service: "Marketplace",
      timestamp: "2026-07-04T12:00:00.000Z",
    });
  });

  it("fails deep readiness safely when critical dependencies are missing", async () => {
    const readiness = await collectReadiness({
      env: {},
      now: new Date("2026-07-04T12:00:00.000Z"),
    });

    expect(readiness.status).toBe("degraded");
    expect(readiness.checks.supabase).toEqual({
      status: "fail",
      reason: "missing_config",
    });
    expect(readiness.checks.stripe).toMatchObject({
      status: "fail",
      secretKey: "fail",
      webhookSecret: "fail",
    });
    expect(JSON.stringify(readiness)).not.toContain("sk_test");
    expect(JSON.stringify(readiness)).not.toContain("service-role");
  });

  it("passes deep readiness with configured Stripe and a successful Supabase probe", async () => {
    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          limit: vi.fn(async () => ({ data: [], error: null })),
        })),
      })),
    };

    const readiness = await collectReadiness({
      supabase: supabase as never,
      env: {
        APP_NAME: "Ops Console",
        NEXT_PUBLIC_SUPABASE_URL: "https://abc123.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY: "service-role-secret",
        STRIPE_SECRET_KEY: "sk_test_123",
        STRIPE_WEBHOOK_SECRET: "whsec_123",
        RESEND_API_KEY: "re_test_123",
        RESEND_FROM_EMAIL: "orders@example.test",
      },
      now: new Date("2026-07-04T12:00:00.000Z"),
    });

    expect(readiness.status).toBe("ok");
    expect(readiness.service).toBe("Ops Console");
    expect(readiness.checks.supabase).toEqual({ status: "ok" });
    expect(readiness.checks.notifications.email).toBe("configured");
    expect(JSON.stringify(readiness)).not.toContain("service-role-secret");
    expect(JSON.stringify(readiness)).not.toContain("sk_test_123");
  });
});
