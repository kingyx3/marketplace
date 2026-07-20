import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isAdminEmailAllowed, parseAdminEmailAllowlist } from "@/lib/admin-email-allowlist";
import type { StaffProfile } from "@/lib/admin-staff";
import { permissionsForRole } from "@/lib/control-permissions";
import {
  extractBearerToken,
  isAdminRole,
  requireApiAdmin,
  requireApiPermission,
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

  it("provisions an environment allowlisted API user as a protected owner", async () => {
    const request = adminRequest();
    const state = fakeAdminSupabase();

    await expect(requireApiAdmin(request, state.client as never)).resolves.toMatchObject({
      user: { id: "user-1" },
      isAdmin: true,
      roles: expect.arrayContaining(["owner"]),
    });
    expect(state.staff).toMatchObject({ role: "owner", active: true, source: "environment" });
  });

  it("revalidates an active database-managed administrator outside the environment whitelist", async () => {
    process.env.ADMIN_EMAIL_ALLOWLIST = "owner@example.test";
    const request = adminRequest();
    const state = fakeAdminSupabase({
      staff: {
        id: "staff-1",
        role: "viewer",
        active: true,
        email: "admin@example.test",
        source: "database",
      },
      grant: {
        id: "grant-1",
        role: "operations",
        active: true,
        created_by_staff_id: "owner-staff",
      },
    });

    await expect(requireApiAdmin(request, state.client as never)).resolves.toMatchObject({
      user: { id: "user-1" },
      roles: expect.arrayContaining(["operations"]),
      staff: { role: "operations" },
      isAdmin: true,
    });
  });

  it("enforces role permissions after administrator authentication", async () => {
    process.env.ADMIN_EMAIL_ALLOWLIST = "owner@example.test";
    const state = fakeAdminSupabase({
      staff: {
        id: "staff-1",
        role: "operations",
        active: true,
        email: "admin@example.test",
        source: "database",
      },
      grant: {
        id: "grant-1",
        role: "operations",
        active: true,
        created_by_staff_id: "owner-staff",
      },
    });

    await expect(
      requireApiPermission(adminRequest(), "orders.view", state.client as never)
    ).resolves.toMatchObject({ staff: { role: "operations" } });
    await expect(
      requireApiPermission(adminRequest(), "governance.manage", state.client as never)
    ).rejects.toThrow("Insufficient administrator permission");
  });

  it("rejects an authenticated user without an allowlist entry, staff row, or grant", async () => {
    process.env.ADMIN_EMAIL_ALLOWLIST = "owner@example.test";
    const request = adminRequest();

    await expect(requireApiAdmin(request, fakeAdminSupabase().client as never)).rejects.toThrow(
      "Active staff access required"
    );
  });

  it("rejects stale database staff when the delegated grant is absent", async () => {
    process.env.ADMIN_EMAIL_ALLOWLIST = "owner@example.test";
    const state = fakeAdminSupabase({
      staff: {
        id: "staff-1",
        role: "admin",
        active: true,
        email: "admin@example.test",
        source: "database",
      },
    });

    await expect(requireApiAdmin(adminRequest(), state.client as never)).rejects.toThrow(
      "Active staff access required"
    );
  });

  it("normalizes the server allowlist and fails closed on malformed values", () => {
    expect([
      ...parseAdminEmailAllowlist(" Owner@Example.test,ops@example.test,owner@example.test "),
    ]).toEqual(["owner@example.test", "ops@example.test"]);
    expect(isAdminEmailAllowed("OWNER@example.test", "owner@example.test")).toBe(true);
    expect(parseAdminEmailAllowlist("owner@example.test,not-an-email").size).toBe(0);
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

interface FakeGrant {
  id: string;
  role: StaffProfile["role"];
  active: boolean;
  created_by_staff_id: string | null;
  permissions?: string[];
  admin_access_grant_permissions?: Array<{ permission_key: string }>;
}

function adminRequest() {
  return new Request("https://example.test/api/admin/orders", {
    headers: { authorization: "Bearer token-123" },
  });
}

function fakeAdminSupabase(initial?: { staff?: StaffProfile; grant?: FakeGrant }) {
  const state: {
    staff: (StaffProfile & { auth_user_id?: string }) | null;
    grant: FakeGrant | null;
    client: {
      auth: { getUser: ReturnType<typeof vi.fn> };
      from: ReturnType<typeof vi.fn>;
    };
  } = {
    staff: initial?.staff ?? null,
    grant: initial?.grant
      ? {
          ...initial.grant,
          admin_access_grant_permissions: (
            initial.grant.permissions ?? permissionsForRole(initial.grant.role)
          ).map((permission_key) => ({ permission_key })),
        }
      : null,
    client: null as never,
  };

  state.client = {
    auth: {
      getUser: vi.fn(async () => ({
        data: {
          user: {
            id: "user-1",
            email: "admin@example.test",
            app_metadata: { role: "customer" },
          },
        },
        error: null,
      })),
    },
    from: vi.fn((table: string) => {
      if (table === "staff_users") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({ data: state.staff, error: null })),
            })),
          })),
          update: vi.fn((input: Record<string, unknown>) => ({
            eq: vi.fn(() => ({
              select: vi.fn(() => ({
                single: vi.fn(async () => {
                  state.staff = {
                    ...(state.staff ?? { id: "staff-1" }),
                    ...input,
                  } as StaffProfile;
                  return { data: state.staff, error: null };
                }),
              })),
            })),
          })),
          insert: vi.fn((input: Record<string, unknown>) => ({
            select: vi.fn(() => ({
              single: vi.fn(async () => {
                state.staff = {
                  id: "provisioned-staff",
                  ...input,
                } as StaffProfile & { auth_user_id?: string };
                return { data: state.staff, error: null };
              }),
            })),
          })),
        };
      }

      if (table === "admin_access_grants") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({ data: state.grant, error: null })),
              })),
            })),
          })),
          update: vi.fn(() => ({
            eq: vi.fn(async () => ({ error: null })),
          })),
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    }),
  };

  return state;
}
