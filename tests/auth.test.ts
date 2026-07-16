import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  isAdminEmailAllowed,
  parseAdminEmailAllowlist,
} from "@/lib/admin-email-allowlist";
import type { StaffProfile } from "@/lib/admin-staff";
import {
  extractBearerToken,
  isAdminRole,
  requireApiAdmin,
  rolesFromUser,
} from "@/lib/api/auth";
import { getRequestOrigin } from "@/lib/request-origin";
import { appendWelcomeParam, isFreshSignup } from "@/lib/signup-welcome";

const originalAdminEmailAllowlist = process.env.ADMIN_EMAIL_ALLOWLIST;

describe("auth helpers", () => {
  beforeEach(() => {
    process.env.ADMIN_EMAIL_ALLOWLIST = "admin@example.test";
  });

  afterEach(() => {
    if (originalAdminEmailAllowlist === undefined) delete process.env.ADMIN_EMAIL_ALLOWLIST;
    else process.env.ADMIN_EMAIL_ALLOWLIST = originalAdminEmailAllowlist;
  });

  it("extracts bearer tokens case-insensitively", () => {
    const request = new Request("https://example.test", {
      headers: { authorization: "bearer token-123" },
    });
    expect(extractBearerToken(request)).toBe("token-123");
  });

  it("reads only server-controlled app metadata roles", () => {
    const roles = rolesFromUser({
      app_metadata: { role: "admin", roles: ["ops", "admin", ""] },
    });
    expect(roles.sort()).toEqual(["admin", "ops"]);
  });

  it("recognizes admin and ops roles", () => {
    expect(isAdminRole(["admin"])).toBe(true);
    expect(isAdminRole(["ops"])).toBe(true);
    expect(isAdminRole(["customer"])).toBe(false);
  });

  it("does not let stale app metadata bypass staff deactivation", async () => {
    const request = new Request("https://example.test/api/admin/orders", {
      headers: { authorization: "Bearer token-123" },
    });

    await expect(
      requireApiAdmin(
        request,
        fakeAdminSupabase({ id: "staff-1", role: "admin", active: false }) as never
      )
    ).rejects.toThrow("Active staff access required");
  });

  it("allows an authenticated active staff record", async () => {
    const request = new Request("https://example.test/api/admin/orders", {
      headers: { authorization: "Bearer token-123" },
    });

    await expect(
      requireApiAdmin(
        request,
        fakeAdminSupabase({ id: "staff-1", role: "admin", active: true }) as never
      )
    ).resolves.toMatchObject({ user: { id: "user-1" } });
  });

  it("provisions an allowlisted authenticated user with no staff row", async () => {
    const request = new Request("https://example.test/api/admin/orders", {
      headers: { authorization: "Bearer token-123" },
    });

    await expect(requireApiAdmin(request, fakeAdminSupabase(null) as never)).resolves.toMatchObject({
      user: { id: "user-1" },
    });
  });

  it("requires active staff emails to be in the normalized server allowlist", async () => {
    expect([
      ...parseAdminEmailAllowlist(" Owner@Example.test,ops@example.test,owner@example.test "),
    ]).toEqual(["owner@example.test", "ops@example.test"]);
    expect(isAdminEmailAllowed("OWNER@example.test", "owner@example.test")).toBe(true);
    expect(parseAdminEmailAllowlist("owner@example.test,not-an-email").size).toBe(0);

    process.env.ADMIN_EMAIL_ALLOWLIST = "someone-else@example.test";
    const request = new Request("https://example.test/api/admin/orders", {
      headers: { authorization: "Bearer token-123" },
    });

    await expect(
      requireApiAdmin(
        request,
        fakeAdminSupabase({ id: "staff-1", role: "admin", active: true }) as never
      )
    ).rejects.toThrow("Active staff access required");
  });

  it("detects fresh OAuth signups without treating old users as new", () => {
    const now = new Date("2026-07-04T12:00:00.000Z");

    expect(isFreshSignup({ created_at: "2026-07-04T11:55:00.000Z" }, now)).toBe(true);
    expect(isFreshSignup({ created_at: "2026-07-04T11:40:00.000Z" }, now)).toBe(false);
    expect(isFreshSignup({ created_at: "not-a-date" }, now)).toBe(false);
  });

  it("adds the welcome flag to safe internal redirect paths", () => {
    expect(appendWelcomeParam("/account")).toBe("/account?welcome=1");
    expect(appendWelcomeParam("/account?tab=orders")).toBe("/account?tab=orders&welcome=1");
  });

  it("uses the browser-visible loopback origin for local auth redirects", () => {
    const request = new Request("http://localhost:3100/auth/sign-in", {
      headers: { host: "127.0.0.1:3100" },
    });

    expect(getRequestOrigin(request, "http://localhost:3000")).toBe("http://127.0.0.1:3100");
  });

  it("pins hosted auth redirects to the canonical site URL", () => {
    const request = new Request("https://internal.example/auth/sign-in", {
      headers: {
        host: "internal.example",
        "x-forwarded-host": "attacker.example",
        "x-forwarded-proto": "http",
      },
    });

    expect(getRequestOrigin(request, "https://shop.example.com/path")).toBe(
      "https://shop.example.com"
    );
  });

  it("falls back to the immutable Vercel preview deployment URL", () => {
    const request = new Request("https://internal.example/auth/sign-in");

    expect(
      getRequestOrigin(
        request,
        "https://shop.example.com",
        "preview",
        "marketplace-a1b2c3-kingyx3.vercel.app"
      )
    ).toBe("https://marketplace-a1b2c3-kingyx3.vercel.app");
  });

  it("preserves a trusted Vercel branch alias used by the browser", () => {
    const request = new Request("https://internal.example/auth/sign-in", {
      headers: {
        "x-forwarded-host": "marketplace-git-feature-kingyx3.vercel.app",
        "x-forwarded-proto": "https",
      },
    });

    expect(
      getRequestOrigin(
        request,
        "https://shop.example.com",
        "preview",
        "marketplace-a1b2c3-kingyx3.vercel.app",
        "marketplace-git-feature-kingyx3.vercel.app"
      )
    ).toBe("https://marketplace-git-feature-kingyx3.vercel.app");
  });

  it("does not trust a forwarded preview host that Vercel did not supply", () => {
    const request = new Request("https://internal.example/auth/sign-in", {
      headers: {
        "x-forwarded-host": "attacker-kingyx3.vercel.app",
        "x-forwarded-proto": "https",
      },
    });

    expect(
      getRequestOrigin(
        request,
        "https://shop.example.com",
        "preview",
        "marketplace-a1b2c3-kingyx3.vercel.app",
        "marketplace-git-feature-kingyx3.vercel.app"
      )
    ).toBe("https://marketplace-a1b2c3-kingyx3.vercel.app");
  });

  it("does not trust a nonstandard port on an otherwise trusted preview host", () => {
    const request = new Request("https://internal.example/auth/sign-in", {
      headers: {
        "x-forwarded-host": "marketplace-git-feature-kingyx3.vercel.app:444",
        "x-forwarded-proto": "https",
      },
    });

    expect(
      getRequestOrigin(
        request,
        "https://shop.example.com",
        "preview",
        "marketplace-a1b2c3-kingyx3.vercel.app",
        "marketplace-git-feature-kingyx3.vercel.app"
      )
    ).toBe("https://marketplace-a1b2c3-kingyx3.vercel.app");
  });

  it("does not trust a non-Vercel hostname supplied as the preview URL", () => {
    const request = new Request("https://internal.example/auth/sign-in");

    expect(
      getRequestOrigin(
        request,
        "https://shop.example.com",
        "preview",
        "marketplace.vercel.app.attacker.example"
      )
    ).toBe("https://shop.example.com");
  });

  it("rejects hosted auth redirects without a valid canonical URL", () => {
    const request = new Request("https://shop.example.com/auth/sign-in");

    expect(() => getRequestOrigin(request, "not-a-url")).toThrow(
      "NEXT_PUBLIC_SITE_URL must be a valid hosted URL"
    );
  });
});

function fakeAdminSupabase(initialStaff: StaffProfile | null) {
  let staff = initialStaff;
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    maybeSingle: vi.fn(async () => ({ data: staff, error: null })),
    insert: vi.fn((input: { role: StaffProfile["role"]; active: boolean }) => {
      staff = { id: "provisioned-staff", role: input.role, active: input.active };
      return builder;
    }),
    single: vi.fn(async () => ({ data: staff, error: null })),
  };

  return {
    auth: {
      getUser: vi.fn(async () => ({
        data: {
          user: {
            id: "user-1",
            email: "admin@example.test",
            app_metadata: { role: "admin" },
          },
        },
        error: null,
      })),
    },
    from: vi.fn(() => builder),
  };
}
