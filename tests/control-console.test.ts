import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

import { hasControlPermission } from "@/lib/control-access";
import type { StaffProfile } from "@/lib/admin-staff";

describe("control console", () => {
  it("enforces least-privilege role permissions", () => {
    expect(hasControlPermission(staff("viewer"), "view_control")).toBe(true);
    expect(hasControlPermission(staff("viewer"), "manage_catalog")).toBe(false);
    expect(hasControlPermission(staff("catalog"), "manage_catalog")).toBe(true);
    expect(hasControlPermission(staff("catalog"), "manage_suppliers")).toBe(false);
    expect(hasControlPermission(staff("operations"), "manage_suppliers")).toBe(true);
    expect(hasControlPermission(staff("operations"), "manage_full_operations")).toBe(false);
    expect(hasControlPermission(staff("admin"), "manage_full_operations")).toBe(true);
    expect(hasControlPermission(staff("admin"), "manage_admins")).toBe(true);
    expect(hasControlPermission(staff("owner"), "manage_admins")).toBe(true);
    expect(hasControlPermission({ ...staff("owner"), active: false }, "view_control")).toBe(false);
  });

  it("ships dedicated supplier, category, set, administrator, and audit screens", async () => {
    for (const path of [
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
  });

  it("keeps every control mutation server-authorized and database-backed", async () => {
    const source = await readFile(new URL("../app/actions/control.ts", import.meta.url), "utf8");

    expect(source).toContain('"use server"');
    expect(source).toContain('requireControlPermission("manage_suppliers"');
    expect(source).toContain('requireControlPermission("manage_catalog"');
    expect(source).toContain('requireControlPermission("manage_admins"');
    expect(source).toContain('rpc("admin_upsert_supplier"');
    expect(source).toContain('rpc("admin_upsert_category"');
    expect(source).toContain('rpc("admin_upsert_set_release"');
    expect(source).toContain('rpc("admin_upsert_access_grant"');
  });

  it("adds relational safeguards and protected administrator grants in one migration", async () => {
    const source = await readFile(
      new URL("../supabase/migrations/20260717090000_control_console.sql", import.meta.url),
      "utf8"
    );

    expect(source).toContain("create table if not exists public.admin_access_grants");
    expect(source).toContain("prevent_tcg_category_cycle");
    expect(source).toContain("category has active children, sets, or products");
    expect(source).toContain("supplier has open purchase orders");
    expect(source).toContain("set has active products");
    expect(source).toContain("environment allowlisted owners are managed through ADMIN_EMAIL_ALLOWLIST");
    expect(source).toContain("cannot remove or demote the final active owner");
    expect(source).toContain("grant execute on function public.admin_upsert_access_grant");
  });
});

function staff(role: StaffProfile["role"]): StaffProfile {
  return { id: `${role}-staff`, role, active: true };
}
