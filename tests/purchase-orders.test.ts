import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { adminPurchaseOrderFromForm } from "@/lib/admin-purchase-order-forms";

describe("admin supplier purchase orders", () => {
  it("builds service-role intake payloads from required admin form fields", () => {
    const form = new FormData();
    form.set("supplierId", "22222222-2222-4222-8222-222222222222");
    form.set("productId", "11111111-1111-4111-8111-111111111111");
    form.set("quantity", "12");
    form.set("unitCostCents", "15000");
    form.set("currency", "sgd");
    form.set("expectedAt", "2026-08-01");
    form.set("notes", "PO-1001");

    expect(adminPurchaseOrderFromForm(form)).toEqual({
      supplierId: "22222222-2222-4222-8222-222222222222",
      productId: "11111111-1111-4111-8111-111111111111",
      quantity: 12,
      unitCostCents: 15000,
      currency: "SGD",
      expectedAt: "2026-08-01",
      notes: "PO-1001",
    });
  });

  it("rejects missing quantity and malformed currency before calling Supabase", () => {
    const form = new FormData();
    form.set("supplierId", "22222222-2222-4222-8222-222222222222");
    form.set("productId", "11111111-1111-4111-8111-111111111111");
    form.set("quantity", "0");
    form.set("unitCostCents", "15000");
    form.set("currency", "SG");

    expect(() => adminPurchaseOrderFromForm(form)).toThrow(
      "currency must be a 3-letter currency code"
    );

    form.set("currency", "SGD");
    expect(() => adminPurchaseOrderFromForm(form)).toThrow("quantity must be at least 1");
  });

  it("keeps supplier PO intake service-role-only and stock-affecting", async () => {
    const migration = await readFile(
      new URL(
        "../supabase/migrations/20260722100000_remove_sku_model.sql",
        import.meta.url
      ),
      "utf8"
    );

    expect(migration).toContain("admin_create_supplier_purchase_order");
    expect(migration).toContain("status");
    expect(migration).toContain("'confirmed'");
    expect(migration).toContain("insert into public.purchase_order_items");
    expect(migration).toContain("on conflict (product_id, location) do update");
    expect(migration).toContain("set incoming = inventory_row.incoming + excluded.incoming");
    expect(migration).toContain("ADMIN_SUPPLIER_PO_INTAKE");
    expect(migration).toContain("from public, anon, authenticated");
    expect(migration).toContain("to service_role");
  });
});
