import { describe, expect, it } from "vitest";
import { extractBearerToken, isAdminRole, rolesFromUser } from "@/lib/api/auth";
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

  it("uses the public host for same-origin auth redirects", () => {
    const request = new Request("http://localhost:3100/auth/sign-in", {
      headers: { host: "127.0.0.1:3100" },
    });

    expect(getRequestOrigin(request)).toBe("http://127.0.0.1:3100");
  });

  it("prefers forwarded host and protocol behind a proxy", () => {
    const request = new Request("http://internal:3000/auth/sign-in", {
      headers: {
        host: "internal:3000",
        "x-forwarded-host": "shop.example.com, proxy.internal",
        "x-forwarded-proto": "https, http",
      },
    });

    expect(getRequestOrigin(request)).toBe("https://shop.example.com");
  });
});
