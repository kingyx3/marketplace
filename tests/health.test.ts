import { describe, expect, it, vi } from "vitest";
import { collectReadiness, shallowHealth } from "@/lib/readiness";

describe("health and readiness", () => {
  it("keeps shallow health dependency-free", () => {
    expect(
      shallowHealth(new Date("2026-07-04T12:00:00.000Z"), { APP_NAME: "Configured Store" })
    ).toEqual({
      status: "ok",
      service: "Configured Store",
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
    expect(readiness.checks.hitpay).toEqual({
      status: "fail",
      apiKey: "fail",
      webhookSalt: "fail",
      apiUrl: "configured",
    });
    expect(JSON.stringify(readiness)).not.toContain("sk_test");
    expect(JSON.stringify(readiness)).not.toContain("sb_secret");
  });

  it("passes deep readiness with only the required HitPay secrets and a successful Supabase probe", async () => {
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
        TARGET_ENV: "production",
        NEXT_PUBLIC_SUPABASE_URL: "https://abc123.supabase.co",
        SUPABASE_SECRET_KEY: "sb_secret_test_123",
        HITPAY_API_KEY: "hitpay_test_api_key",
        HITPAY_WEBHOOK_SALT: "hitpay_test_webhook_salt",
        RESEND_API_KEY: "re_test_123",
        RESEND_FROM_EMAIL: "orders@example.test",
      },
      now: new Date("2026-07-04T12:00:00.000Z"),
    });

    expect(readiness.status).toBe("ok");
    expect(readiness.service).toBe("Ops Console");
    expect(readiness.checks.supabase).toEqual({ status: "ok" });
    expect(readiness.checks.hitpay).toEqual({
      status: "ok",
      apiKey: "configured",
      webhookSalt: "configured",
      apiUrl: "configured",
    });
    expect(readiness.checks.notifications.email).toBe("configured");
    expect(JSON.stringify(readiness)).not.toContain("sb_secret_test_123");
    expect(JSON.stringify(readiness)).not.toContain("hitpay_test_api_key");
  });
});
