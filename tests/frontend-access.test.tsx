import { readFile } from "node:fs/promises";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { SiteHeader } from "@/app/_components/site-header";
import type { CurrentViewer } from "@/lib/auth";

describe("audience-aware frontend access", () => {
  it("shows only public navigation to anonymous visitors", () => {
    const html = renderHeader({ user: null, staff: null, staffLookup: "not_applicable" });

    expect(html).toContain("Catalog");
    expect(html).toContain("Cart");
    expect(html).toContain("Sign in");
    expect(html).not.toContain("Deals");
    expect(html).not.toContain("Wholesale");
    expect(html).not.toContain("Account");
    expect(html).not.toContain("Orders");
    expect(html).not.toContain("Admin");
  });

  it("keeps admin navigation hidden from regular authenticated customers", () => {
    const html = renderHeader({
      user: { id: "customer-user" } as CurrentViewer["user"],
      staff: null,
      staffLookup: "resolved",
    });

    expect(html).toContain("Account");
    expect(html).toContain("Orders");
    expect(html).toContain("Sign out");
    expect(html).not.toContain("Admin");
  });

  it("shows admin navigation only after an active staff lookup", () => {
    const html = renderHeader({
      user: { id: "staff-user" } as CurrentViewer["user"],
      staff: { id: "staff-row", role: "admin", active: true },
      staffLookup: "resolved",
    });

    expect(html).toContain("Admin");
  });

  it("protects every admin page through a shared layout and publishes required policies", async () => {
    const [adminLayout, pageAuth, apiAuth] = await Promise.all([
      readFile(new URL("../app/(shop)/admin/layout.tsx", import.meta.url), "utf8"),
      readFile(new URL("../lib/auth.ts", import.meta.url), "utf8"),
      readFile(new URL("../lib/api/auth.ts", import.meta.url), "utf8"),
    ]);
    expect(adminLayout).toContain('requireStaff("/admin")');
    expect(pageAuth).toContain("isAdminEmailAllowed(user.email)");
    expect(apiAuth).toContain("isAdminEmailAllowed(auth.user.email)");

    for (const policy of [
      "privacy",
      "terms",
      "cookies",
      "returns",
      "shipping",
      "accessibility",
      "contact",
    ]) {
      const source = await readFile(
        new URL(`../app/(legal)/${policy}/page.tsx`, import.meta.url),
        "utf8"
      );
      expect(source.length).toBeGreaterThan(100);
    }
  });
});

function renderHeader(viewer: CurrentViewer): string {
  return renderToStaticMarkup(<SiteHeader appName="Marketplace" viewer={viewer} />);
}
