import { describe, expect, it, vi } from "vitest";
import {
  extractBearerToken,
  isAdminRole,
  requireApiAdmin,
  rolesFromUser,
} from "@/lib/api/auth";
import { getRequestOrigin } from "@/lib/request-origin";
import { appendWelcomeParam, isFreshSignup } from "@/lib/signup-welcome";

describe("auth helpers", () => {
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

    await expect(requireApiAdmin(request, fakeAdminSupabase(null) as never)).rejects.toThrow(
      "Active staff access required"
    );
  });

  it("allows an authenticated active staff record", async () => {
    const request = new Request("https://example.test/api/admin/orders", {
      headers: { authorization: "Bearer token-123" },
    });

    await expect(
      requireApiAdmin(request, fakeAdminSupabase({ id: "staff-1" }) as never)
    ).resolves.toMatchObject({ user: { id: "user-1" } });
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

  it("rejects hosted auth redirects without a valid canonical URL", () => {
    const request = new Request("https://shop.example.com/auth/sign-in");

    expect(() => getRequestOrigin(request, "not-a-url")).toThrow(
      "NEXT_PUBLIC_SITE_URL must be a valid hosted URL"
    );
  });
});

function fakeAdminSupabase(staff: { id: string } | null) {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    maybeSingle: vi.fn(async () => ({ data: staff, error: null })),
  };

  return {
    auth: {
      getUser: vi.fn(async () => ({
        data: {
          user: {
            id: "user-1",
            app_metadata: { role: "admin" },
          },
        },
        error: null,
      })),
    },
    from: vi.fn(() => builder),
  };
}
