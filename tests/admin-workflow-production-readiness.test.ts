import { access, readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

import { validateAdminFormRelationships } from "@/lib/admin-form-relationships";

const mutationSurfaces = [
  "app/(shop)/control/_components/administrator-grant-form.tsx",
  "app/(shop)/control/_components/catalog-product-details-editor.tsx",
  "app/(shop)/control/_components/catalog-product-editor.tsx",
  "app/(shop)/control/_components/category-form.tsx",
  "app/(shop)/control/_components/customer-lifecycle-control.tsx",
  "app/(shop)/control/_components/deal-form.tsx",
  "app/(shop)/control/_components/delivery-editor.tsx",
  "app/(shop)/control/_components/listing-item-form.tsx",
  "app/(shop)/control/_components/manual-reconciliation-form.tsx",
  "app/(shop)/control/_components/set-form.tsx",
  "app/(shop)/control/_components/storefront-configuration-form.tsx",
  "app/(shop)/control/_components/supplier-form.tsx",
  "app/(shop)/control/catalog/categories/[categoryId]/page.tsx",
  "app/(shop)/control/catalog/sets/[setId]/page.tsx",
  "app/(shop)/control/orders/allocations/[skuId]/page.tsx",
  "app/(shop)/control/orders/normal/[orderId]/page.tsx",
  "app/(shop)/control/pricing/deals/[dealId]/page.tsx",
  "app/(shop)/control/pricing/skus/[skuId]/page.tsx",
  "app/(shop)/control/storefront/listings/[productId]/page.tsx",
  "app/(shop)/control/supply/inventory/[skuId]/page.tsx",
  "app/(shop)/control/supply/purchase-orders/new/page.tsx",
  "app/(shop)/control/supply/suppliers/[supplierId]/page.tsx",
];

describe("admin workflow production readiness", () => {
  it("routes every standard mutation surface through the shared action form", async () => {
    for (const path of mutationSurfaces) {
      const source = await read(path);
      expect(source, path).toContain("ControlActionForm");
      expect(source, path).not.toContain("window.confirm(");
    }
  });

  it("keeps specialized stateful and upload forms in the shared dirty-form contract", async () => {
    for (const path of [
      "app/(shop)/control/_components/catalog-product-save-form.tsx",
      "app/(shop)/control/_components/product-intake-form.tsx",
      "app/(shop)/control/_components/product-image-uploader.tsx",
    ]) {
      const source = await read(path);
      expect(source, path).toContain('data-admin-form="true"');
      expect(source, path).toContain('data-dirty="false"');
    }
  });

  it("provides accessible pending, error, confirmation, and dirty-modal foundations", async () => {
    const [form, fields, confirmation, modal, guardedLink] = await Promise.all([
      read("app/(shop)/control/_components/admin-action-form.tsx"),
      read("app/(shop)/control/_components/admin-form-fields.tsx"),
      read("app/(shop)/control/_components/control-confirm-dialog.tsx"),
      read("app/(shop)/control/_components/control-modal-route.tsx"),
      read("app/(shop)/control/_components/control-guarded-link.tsx"),
    ]);

    expect(form).toContain("aria-busy={pending}");
    expect(form).toContain("fieldErrors");
    expect(form).toContain('role={result.status === "error" ? "alert" : "status"}');
    expect(form).toContain("disabled={buttonProps.disabled || pending}");
    expect(fields).toContain("useAdminFieldError(name)");
    expect(confirmation).toContain('role="alertdialog"');
    expect(confirmation).toContain('aria-modal="true"');
    expect(modal).toContain("focusableElements");
    expect(modal).toContain("previouslyFocused?.focus()");
    expect(modal).toContain("Discard unsaved changes?");
    expect(modal).toContain('window.addEventListener("popstate"');
    expect(guardedLink).toContain("Discard unsaved changes?");
  });

  it("validates cross-field relationships before server submission", () => {
    const data = new FormData();
    data.set("startsAt", "2026-07-20T12:00");
    data.set("endsAt", "2026-07-20T11:00");
    data.set("priceCents", "19900");
    data.set("compareAtCents", "19900");
    data.set("valueJson", "[]");
    data.set("tags", Array.from({ length: 13 }, (_, index) => `tag-${index}`).join(","));

    expect(validateAdminFormRelationships(data)).toEqual({
      endsAt: "End time must be after the start time.",
      compareAtCents: "Compare-at cents must be greater than the selling price.",
      valueJson: "JSON value must be an object.",
      tags: "A listing can have at most 12 tags.",
    });
  });

  it("retains the complete list-first admin route inventory", async () => {
    const routes = [
      "catalog/categories",
      "catalog/products/new",
      "catalog/sets",
      "customers",
      "finance/reconciliations/new",
      "fulfilment/deliveries",
      "governance/administrators",
      "governance/audit",
      "orders/allocations",
      "orders/normal/[orderId]",
      "orders/preorders/[preorderId]",
      "pricing/deals",
      "pricing/skus/[skuId]",
      "storefront/listings",
      "supply/inventory/[skuId]",
      "supply/purchase-orders/new",
      "supply/suppliers",
    ];
    await Promise.all(
      routes.map((route) =>
        access(new URL(`../app/(shop)/control/${route}/page.tsx`, import.meta.url))
      )
    );
  });
});

function read(path: string) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}
