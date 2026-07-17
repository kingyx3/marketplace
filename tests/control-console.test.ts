import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

import { hasControlPermission } from "@/lib/control-access";
import { controlSupplierFromForm } from "@/lib/control-forms";
import type { StaffProfile } from "@/lib/admin-staff";

describe("control console", () => {
  it("enforces least-privilege role permissions", () => {
    expect(hasControlPermission(staff("viewer"), "view_control")).toBe(true);
    expect(hasControlPermission(staff("viewer"), "manage_catalog")).toBe(false);
    expect(hasControlPermission(staff("catalog"), "manage_catalog")).toBe(true);
    expect(hasControlPermission(staff("catalog"), "manage_suppliers")).toBe(false);
    expect(hasControlPermission(staff("catalog"), "manage_customers")).toBe(false);
    expect(hasControlPermission(staff("operations"), "manage_suppliers")).toBe(true);
    expect(hasControlPermission(staff("operations"), "manage_full_operations")).toBe(false);
    expect(hasControlPermission(staff("admin"), "manage_full_operations")).toBe(true);
    expect(hasControlPermission(staff("admin"), "manage_customers")).toBe(true);
    expect(hasControlPermission(staff("admin"), "manage_admins")).toBe(true);
    expect(hasControlPermission(staff("owner"), "manage_admins")).toBe(true);
    expect(hasControlPermission({ ...staff("owner"), active: false }, "view_control")).toBe(false);
  });

  it("prefers the checked value over a hidden checkbox fallback", () => {
    const formData = new FormData();
    formData.append("name", "Supplier One");
    formData.append("supplierType", "distributor");
    formData.append("currency", "SGD");
    formData.append("active", "false");
    formData.append("active", "true");

    expect(controlSupplierFromForm(formData).active).toBe(true);
  });

  it("ships one operations workspace and focused administrative screens", async () => {
    for (const path of [
      "../app/(shop)/control/operations/page.tsx",
      "../app/(shop)/control/customers/page.tsx",
      "../app/(shop)/control/suppliers/page.tsx",
      "../app/(shop)/control/categories/page.tsx",
      "../app/(shop)/control/sets/page.tsx",
      "../app/(shop)/control/administrators/page.tsx",
      "../app/(shop)/control/audit/page.tsx",
    ]) {
      const source = await readFile(new URL(path, import.meta.url), "utf8");
      expect(source).toContain("requireControlPermission");
      expect(source.length).toBeGreaterThan(1000);
    }

    const operations = await readFile(
      new URL("../app/(shop)/control/operations/page.tsx", import.meta.url),
      "utf8"
    );
    expect(operations).toContain('requireControlPermission("manage_catalog", "/control/operations")');
    expect(operations).toContain('hasControlPermission(staff, "manage_full_operations")');
    expect(operations).toContain("ProductIntakeForm");
    expect(operations).toContain('from("product_types")');
    expect(operations).not.toContain('label="Name" name="name"');
    expect(operations).not.toContain('label="Slug" name="slug"');
  });

  it("keeps every control mutation server-authorized and database-backed", async () => {
    const [controlActions, catalogActions, operationalActions, customerActions] = await Promise.all([
      readFile(new URL("../app/actions/control.ts", import.meta.url), "utf8"),
      readFile(new URL("../app/actions/catalog.ts", import.meta.url), "utf8"),
      readFile(new URL("../app/actions/admin.ts", import.meta.url), "utf8"),
      readFile(new URL("../app/actions/customer-admin.ts", import.meta.url), "utf8"),
    ]);

    expect(controlActions).toContain('"use server"');
    expect(controlActions).toContain('requireControlPermission("manage_suppliers"');
    expect(controlActions).toContain('requireControlPermission("manage_catalog"');
    expect(controlActions).toContain('requireControlPermission("manage_admins"');
    expect(controlActions).toContain('rpc("admin_upsert_supplier"');
    expect(controlActions).toContain('rpc("admin_upsert_category"');
    expect(controlActions).toContain('rpc("admin_upsert_set_release"');
    expect(controlActions).toContain('rpc("admin_upsert_access_grant"');
    expect(catalogActions).toContain('requireControlPermission("manage_catalog", "/control/operations")');
    expect(catalogActions).toContain('rpc("admin_create_catalog_product_hierarchy"');
    expect(catalogActions).toContain('rpc("admin_upsert_catalog_product"');
    expect(catalogActions).toContain('rpc("admin_upsert_booster_box_sku"');
    expect(catalogActions).not.toContain("p_name: input.name");
    expect(catalogActions).not.toContain("p_slug: input.slug");
    expect(customerActions).toContain('"manage_customers"');
    expect(customerActions).toContain("setCustomerAccountDeleted");
    expect(operationalActions).toContain('requireControlPermission("manage_full_operations"');
    expect(operationalActions).not.toContain('requireStaff("/admin');
  });

  it("requires explicit permissions on bearer-token administrative APIs", async () => {
    const [apiAuth, orders, allocation, notifications] = await Promise.all([
      readFile(new URL("../lib/api/auth.ts", import.meta.url), "utf8"),
      readFile(new URL("../app/api/admin/orders/route.ts", import.meta.url), "utf8"),
      readFile(new URL("../app/api/admin/preorders/allocate/route.ts", import.meta.url), "utf8"),
      readFile(new URL("../app/api/admin/waitlist/notify/route.ts", import.meta.url), "utf8"),
    ]);

    expect(apiAuth).toContain("requireApiPermission");
    expect(orders).toContain('requireApiPermission(request, "manage_orders")');
    expect(allocation).toContain('requireApiPermission(request, "manage_full_operations")');
    expect(notifications).toContain('requireApiPermission(request, "manage_full_operations")');
  });

  it("adds relational safeguards, managed product types, and protected administrator grants", async () => {
    const [controlMigration, hardeningMigration, productIdentityMigration] = await Promise.all([
      readFile(
        new URL("../supabase/migrations/20260717090000_control_console.sql", import.meta.url),
        "utf8"
      ),
      readFile(
        new URL("../supabase/migrations/20260717091000_harden_control_grants.sql", import.meta.url),
        "utf8"
      ),
      readFile(
        new URL(
          "../supabase/migrations/20260717223000_product_types_and_derived_product_identity.sql",
          import.meta.url
        ),
        "utf8"
      ),
    ]);

    expect(controlMigration).toContain("create table if not exists public.admin_access_grants");
    expect(controlMigration).toContain("prevent_tcg_category_cycle");
    expect(controlMigration).toContain("category has active children, sets, or products");
    expect(controlMigration).toContain("supplier has open purchase orders");
    expect(controlMigration).toContain("set has active products");
    expect(controlMigration).toContain("environment allowlisted owners are managed through ADMIN_EMAIL_ALLOWLIST");
    expect(controlMigration).toContain("cannot remove or demote the final active owner");
    expect(controlMigration).toContain("grant execute on function public.admin_upsert_access_grant");
    expect(hardeningMigration).toContain("accepted administrator email cannot be changed");
    expect(hardeningMigration).toContain("synchronize_admin_grant_staff");
    expect(productIdentityMigration).toContain("create table if not exists public.product_types");
    expect(productIdentityMigration).toContain("alter table public.products alter column set_id set not null");
    expect(productIdentityMigration).toContain("create or replace function public.set_catalog_product_identity");
    expect(productIdentityMigration).toContain(
      "new.slug := concat_ws('-', v_category_slug, v_set_segment, v_type_segment, lower(v_language))"
    );
    expect(productIdentityMigration).toContain(
      "product already exists for this category, set, type, and language"
    );
  });
});

function staff(role: StaffProfile["role"]): StaffProfile {
  return { id: `${role}-staff`, role, active: true };
}
