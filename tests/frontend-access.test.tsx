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
    expect(html).not.toContain(">Home<");
    expect(html).not.toContain("Deals");
    expect(html).not.toContain("Wholesale");
    expect(html).not.toContain("Account");
    expect(html).not.toContain("Orders");
    expect(html).not.toContain("Admin");
    expect(html).not.toContain("Control");
  });

  it("keeps control navigation hidden from regular authenticated customers", () => {
    const html = renderHeader({
      user: { id: "customer-user" } as CurrentViewer["user"],
      staff: null,
      staffLookup: "resolved",
    });

    expect(html).toContain("Account");
    expect(html).toContain("Orders");
    expect(html).not.toContain(">Home<");
    expect(html).not.toContain("Sign out");
    expect(html).not.toContain("Admin");
    expect(html).not.toContain("Control");
  });

  it("does not advertise the control console even to active staff", () => {
    const html = renderHeader({
      user: { id: "staff-user" } as CurrentViewer["user"],
      staff: { id: "staff-row", role: "admin", active: true },
      staffLookup: "resolved",
    });

    expect(html).toContain("Account");
    expect(html).not.toContain("Admin");
    expect(html).not.toContain("Control");
    expect(html).not.toContain("/control");
  });

  it("protects the control console, omits legacy admin routing, and publishes policies", async () => {
    const [controlLayout, pageAuth, apiAuth, proxy, siteHeader] = await Promise.all([
      readFile(new URL("../app/(shop)/control/layout.tsx", import.meta.url), "utf8"),
      readFile(new URL("../lib/auth.ts", import.meta.url), "utf8"),
      readFile(new URL("../lib/api/auth.ts", import.meta.url), "utf8"),
      readFile(new URL("../proxy.ts", import.meta.url), "utf8"),
      readFile(new URL("../app/_components/site-header.tsx", import.meta.url), "utf8"),
    ]);

    expect(controlLayout).toContain('requireControlPermission("view_control", "/control")');
    expect(pageAuth).toContain("resolveAdminStaff");
    expect(apiAuth).toContain("resolveAdminStaff");
    expect(proxy).not.toContain('request.nextUrl.pathname === "/admin"');
    expect(proxy).not.toContain('replace(/^\\/admin/, "/control")');
    expect(siteHeader).not.toContain('href="/admin"');
    expect(siteHeader).not.toContain('href="/control"');

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

  it("keeps critical storefront and control surfaces mobile safe", async () => {
    const [siteHeader, appShell, controlShell, catalogBrowser, cartPage, globalStyles] =
      await Promise.all([
        readFile(new URL("../app/_components/site-header.tsx", import.meta.url), "utf8"),
        readFile(new URL("../app/_components/app-shell.tsx", import.meta.url), "utf8"),
        readFile(
          new URL("../app/(shop)/control/_components/control-shell.tsx", import.meta.url),
          "utf8"
        ),
        readFile(new URL("../app/(shop)/catalog/catalog-browser.tsx", import.meta.url), "utf8"),
        readFile(new URL("../app/(shop)/cart/page.tsx", import.meta.url), "utf8"),
        readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
      ]);

    expect(siteHeader).toContain('aria-label="Mobile primary navigation"');
    expect(siteHeader).toContain("overflow-x-auto");
    expect(siteHeader).toContain("min-h-11");
    expect(appShell).toContain("min-w-0");
    expect(controlShell).toContain("snap-x");
    expect(controlShell).toContain("overflow-x-auto");
    expect(catalogBrowser).toContain("lg:grid-cols");
    expect(catalogBrowser).toContain("sm:grid-cols-2");
    expect(cartPage).toContain("grid-cols-[minmax(0,1fr)_auto]");
    expect(globalStyles).toContain("font-size: 16px");
    expect(globalStyles).toContain("overflow-x: clip");
  });
});

function renderHeader(viewer: CurrentViewer): string {
  return renderToStaticMarkup(<SiteHeader appName="Marketplace" viewer={viewer} />);
}
