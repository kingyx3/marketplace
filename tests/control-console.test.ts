import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

import type { StaffProfile } from "@/lib/admin-staff";
import { hasControlPermission } from "@/lib/control-access";
import { controlAccessGrantFromForm, controlSupplierFromForm } from "@/lib/control-forms";

describe("domain-based control console", () => {
  it("applies least-privilege templates and honors explicit checkbox coverage", () => {
    expect(hasControlPermission(staff("viewer"), "control.view")).toBe(true);
    expect(hasControlPermission(staff("viewer"), "catalog.view")).toBe(false);
    expect(hasControlPermission(staff("catalog"), "catalog.manage")).toBe(true);
    expect(hasControlPermission(staff("catalog"), "pricing.manage")).toBe(false);
    expect(hasControlPermission(staff("operations"), "inventory.adjust")).toBe(true);
    expect(hasControlPermission(staff("operations"), "payments.reconcile")).toBe(false);
    expect(hasControlPermission(staff("admin"), "payments.reconcile")).toBe(true);
    expect(hasControlPermission(staff("admin"), "governance.manage")).toBe(false);
    expect(hasControlPermission(staff("owner"), "governance.manage")).toBe(true);

    const custom = { ...staff("admin"), permissions: ["control.view", "orders.view"] };
    expect(hasControlPermission(custom, "orders.view")).toBe(true);
    expect(hasControlPermission(custom, "catalog.manage")).toBe(false);
    expect(hasControlPermission({ ...staff("owner"), active: false }, "control.view")).toBe(false);
  });

  it("parses checkbox fallbacks and normalizes write coverage to domain read coverage", () => {
    const supplier = new FormData();
    supplier.append("name", "Supplier One");
    supplier.append("supplierType", "distributor");
    supplier.append("currency", "SGD");
    supplier.append("active", "false");
    supplier.append("active", "true");
    expect(controlSupplierFromForm(supplier).active).toBe(true);

    const grant = new FormData();
    grant.append("email", "pricing@example.test");
    grant.append("role", "viewer");
    grant.append("active", "true");
    grant.append("permissions", "pricing.manage");
    expect(controlAccessGrantFromForm(grant).permissions).toEqual(
      expect.arrayContaining(["control.view", "pricing.view", "pricing.manage"])
    );
  });

  it("ships one owning page per administrative domain", async () => {
    for (const path of [
      "../app/(shop)/control/catalog/page.tsx",
      "../app/(shop)/control/pricing/page.tsx",
      "../app/(shop)/control/storefront/page.tsx",
      "../app/(shop)/control/supply/page.tsx",
      "../app/(shop)/control/orders/page.tsx",
      "../app/(shop)/control/fulfilment/page.tsx",
      "../app/(shop)/control/customers/page.tsx",
      "../app/(shop)/control/finance/page.tsx",
      "../app/(shop)/control/governance/page.tsx",
    ]) {
      const source = await readFile(new URL(path, import.meta.url), "utf8");
      expect(source).toContain("requireControlPermission");
      expect(source.length).toBeGreaterThan(800);
    }

    const shell = await readFile(
      new URL("../app/(shop)/control/_components/control-shell.tsx", import.meta.url),
      "utf8"
    );
    for (const route of [
      "catalog",
      "pricing",
      "storefront",
      "supply",
      "orders",
      "fulfilment",
      "customers",
      "finance",
      "governance",
    ]) {
      expect(shell).toContain(`/control/${route}`);
    }
    expect(shell).not.toContain("/control/operations");
  });

  it("authorizes each mutation with its action permission", async () => {
    const [control, catalog, operational, pricing, customer] = await Promise.all([
      readFile(new URL("../app/actions/control.ts", import.meta.url), "utf8"),
      readFile(new URL("../app/actions/catalog.ts", import.meta.url), "utf8"),
      readFile(new URL("../app/actions/admin.ts", import.meta.url), "utf8"),
      readFile(new URL("../app/actions/pricing.ts", import.meta.url), "utf8"),
      readFile(new URL("../app/actions/customer-admin.ts", import.meta.url), "utf8"),
    ]);

    expect(control).toContain('requireControlPermission("suppliers.manage"');
    expect(control).toContain('requireControlPermission("catalog.manage"');
    expect(control).toContain('requireControlPermission("governance.manage"');
    expect(control).toContain('rpc("admin_upsert_access_grant_permissions"');
    expect(catalog).toContain('requireControlPermission("catalog.manage", "/control/catalog")');
    expect(catalog).toContain('rpc("admin_update_catalog_product"');
    expect(pricing).toContain('requireControlPermission("pricing.manage"');
    expect(pricing).toContain('rpc("admin_set_product_price"');
    expect(operational).toContain('requireControlPermission("inventory.adjust"');
    expect(operational).toContain('requireControlPermission("purchase_orders.manage"');
    expect(operational).toContain('"payments.reconcile"');
    expect(customer).toContain('"customers.manage"');
  });

  it("requires action permissions on bearer-token administrative APIs", async () => {
    const [orders, allocation, notifications, image] = await Promise.all([
      readFile(new URL("../app/api/admin/orders/route.ts", import.meta.url), "utf8"),
      readFile(new URL("../app/api/admin/preorders/allocate/route.ts", import.meta.url), "utf8"),
      readFile(new URL("../app/api/admin/waitlist/notify/route.ts", import.meta.url), "utf8"),
      readFile(
        new URL("../app/api/control/product-image-upload/route.ts", import.meta.url),
        "utf8"
      ),
    ]);
    expect(orders).toContain('requireApiPermission(request, "orders.view")');
    expect(allocation).toContain('requireApiPermission(request, "preorders.allocate")');
    expect(allocation).toContain('requireApiPermission(request, "refunds.manage", auth.supabase)');
    expect(notifications).toContain('requireApiPermission(request, "communications.manage")');
    expect(image).toContain('requireApiPermission(request, "catalog.manage")');
  });

  it("migrates granular grants, versioned pricing, availability, and publish readiness", async () => {
    const migration = await readFile(
      new URL(
        "../supabase/migrations/20260722100000_remove_sku_model.sql",
        import.meta.url
      ),
      "utf8"
    );
    expect(migration).toContain("drop table if exists public.product_variants cascade");
    expect(migration).toContain("create or replace function public.product_is_sellable");
    expect(migration).toContain("product_inventory");
    expect(migration).toContain("product_prices");
    expect(migration).toContain("admin_upsert_storefront_listing");
    expect(migration).toContain("storefront publication permission required");
    expect(migration).toContain("a current product price is required before publishing");
  });
});

function staff(role: StaffProfile["role"]): StaffProfile {
  return { id: `${role}-staff`, role, active: true };
}
