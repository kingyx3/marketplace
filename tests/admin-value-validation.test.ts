import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

import { adminDeliveryArrangementFromForm } from "@/lib/admin-delivery-forms";
import { isExactIsoDate, requiredSingaporeDateTime, requiredUuid } from "@/lib/admin-form-values";
import { adminListingItemFromForm } from "@/lib/admin-listing-forms";
import { adminSkuPriceFromForm } from "@/lib/admin-pricing-forms";
import { adminPurchaseOrderFromForm } from "@/lib/admin-purchase-order-forms";
import { controlAccessGrantFromForm } from "@/lib/control-forms";

const PRODUCT_ID = "11111111-1111-4111-8111-111111111111";
const SUPPLIER_ID = "22222222-2222-4222-8222-222222222222";
const SKU_ID = "33333333-3333-4333-8333-333333333333";

describe("administrator value validation", () => {
  it("rejects impossible calendar dates and normalizes Singapore local time", () => {
    expect(isExactIsoDate("2026-02-29")).toBe(false);
    expect(isExactIsoDate("2026-13-01")).toBe(false);
    expect(isExactIsoDate("2028-02-29")).toBe(true);

    const form = new FormData();
    form.set("startsAt", "2026-07-20T09:30");
    expect(requiredSingaporeDateTime(form, "startsAt")).toBe("2026-07-20T01:30:00.000Z");

    form.set("startsAt", "2026-02-30T09:30");
    expect(() => requiredSingaporeDateTime(form, "startsAt")).toThrow(
      "startsAt must be a valid Singapore date and time"
    );
  });

  it("rejects malformed record identifiers before database access", () => {
    const form = new FormData();
    form.set("productId", "not-a-product-id");
    expect(() => requiredUuid(form, "productId")).toThrow("productId must be a valid UUID");
  });

  it("rejects listing tag overflow instead of silently dropping values", () => {
    const form = new FormData();
    form.set("productId", PRODUCT_ID);
    form.set("availabilityMode", "available_now");
    form.set("tags", Array.from({ length: 13 }, (_, index) => `tag-${index}`).join(","));

    expect(() => adminListingItemFromForm(form)).toThrow("A listing can have at most 12 tags");
  });

  it("keeps administrator management permission owner-only", () => {
    const delegated = accessGrantForm("admin", ["governance.manage"]);
    expect(() => controlAccessGrantFromForm(delegated)).toThrow(
      "Administrator management can only be assigned to an owner"
    );

    const owner = accessGrantForm("owner", []);
    expect(() => controlAccessGrantFromForm(owner)).toThrow(
      "Owner access must include administrator management"
    );
  });

  it("rejects purchase orders that overflow the database total", () => {
    const form = new FormData();
    form.set("supplierId", SUPPLIER_ID);
    form.set("skuId", SKU_ID);
    form.set("quantity", "2");
    form.set("unitCostCents", "1073741824");
    form.set("currency", "SGD");

    expect(() => adminPurchaseOrderFromForm(form)).toThrow(
      "purchase order total exceeds the supported maximum"
    );
  });

  it("rejects alternate numeric notation for integer database fields", () => {
    const form = new FormData();
    form.set("supplierId", SUPPLIER_ID);
    form.set("skuId", SKU_ID);
    form.set("quantity", "1e2");
    form.set("unitCostCents", "100");
    form.set("currency", "SGD");

    expect(() => adminPurchaseOrderFromForm(form)).toThrow("quantity must be an integer");
  });

  it("requires a real comparison discount", () => {
    const form = new FormData();
    form.set("skuId", SKU_ID);
    form.set("currency", "SGD");
    form.set("priceCents", "19900");
    form.set("compareAtCents", "19900");

    expect(() => adminSkuPriceFromForm(form)).toThrow(
      "Comparison price must be above the selling price"
    );
  });

  it("normalizes and validates fulfilment addresses", () => {
    const form = new FormData();
    form.set("orderId", PRODUCT_ID);
    form.set("carrier", "Ninja Van");
    form.set("recipientName", "Jamie Tan");
    form.set("line1", "1 Market Street");
    form.set("postalCode", "048940");
    form.set("countryCode", "sg");

    expect(adminDeliveryArrangementFromForm(form).address.countryCode).toBe("SG");
    form.set("countryCode", "Singapore");
    expect(() => adminDeliveryArrangementFromForm(form)).toThrow(
      "Country code must be 2 characters or fewer"
    );
  });
});

describe("administrator database contracts", () => {
  it("enforces identity binding, relationship integrity, and exact supply permissions", async () => {
    const migration = await readFile(
      new URL(
        "../supabase/migrations/20260720113000_harden_admin_value_contracts.sql",
        import.meta.url
      ),
      "utf8"
    );

    expect(migration).toContain("products_set_belongs_to_category");
    expect(migration).toContain("foreign key (set_id, category_id)");
    expect(migration).toContain("prevent_accepted_admin_grant_rebinding");
    expect(migration).toContain("access_grant.auth_user_id = p_actor_auth_user_id");
    expect(migration).not.toContain("access_grant.email = lower(staff.email)");
    expect(migration).toContain("normalized_control_permissions");
    expect(migration).toContain("'suppliers.manage'");
    expect(migration).toContain("'inventory.adjust'");
    expect(migration).toContain("'purchase_orders.manage'");
    expect(migration).toContain("not valid");
  });
});

function accessGrantForm(role: string, permissions: string[]): FormData {
  const form = new FormData();
  form.set("email", "operator@example.test");
  form.set("role", role);
  form.set("active", "true");
  for (const permission of permissions) form.append("permissions", permission);
  return form;
}
