import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("list-first control resources", () => {
  it("keeps CRUD index pages focused on navigation", async () => {
    const resources = [
      {
        index: "../app/(shop)/control/supply/suppliers/page.tsx",
        create: "../app/(shop)/control/supply/suppliers/new/page.tsx",
        detail: "../app/(shop)/control/supply/suppliers/[supplierId]/page.tsx",
        modal: "../app/(shop)/control/@modal/(.)supply/suppliers/[supplierId]/page.tsx",
        form: "SupplierForm",
        addHref: "/control/supply/suppliers/new",
      },
      {
        index: "../app/(shop)/control/catalog/categories/page.tsx",
        create: "../app/(shop)/control/catalog/categories/new/page.tsx",
        detail: "../app/(shop)/control/catalog/categories/[categoryId]/page.tsx",
        modal: "../app/(shop)/control/@modal/(.)catalog/categories/[categoryId]/page.tsx",
        form: "CategoryForm",
        addHref: "/control/catalog/categories/new",
      },
      {
        index: "../app/(shop)/control/catalog/sets/page.tsx",
        create: "../app/(shop)/control/catalog/sets/new/page.tsx",
        detail: "../app/(shop)/control/catalog/sets/[setId]/page.tsx",
        modal: "../app/(shop)/control/@modal/(.)catalog/sets/[setId]/page.tsx",
        form: "SetForm",
        addHref: "/control/catalog/sets/new",
      },
      {
        index: "../app/(shop)/control/governance/administrators/page.tsx",
        create: "../app/(shop)/control/governance/administrators/new/page.tsx",
        detail: "../app/(shop)/control/governance/administrators/[grantId]/page.tsx",
        modal: "../app/(shop)/control/@modal/(.)governance/administrators/[grantId]/page.tsx",
        form: "AdministratorGrantForm",
        addHref: "/control/governance/administrators/new",
      },
      {
        index: "../app/(shop)/control/pricing/deals/page.tsx",
        create: "../app/(shop)/control/pricing/deals/new/page.tsx",
        detail: "../app/(shop)/control/pricing/deals/[dealId]/page.tsx",
        modal: "../app/(shop)/control/@modal/(.)pricing/deals/[dealId]/page.tsx",
        form: "DealForm",
        addHref: "/control/pricing/deals/new",
      },
    ];

    for (const resource of resources) {
      const [index, create, detail, modal] = await Promise.all([
        readFile(new URL(resource.index, import.meta.url), "utf8"),
        readFile(new URL(resource.create, import.meta.url), "utf8"),
        readFile(new URL(resource.detail, import.meta.url), "utf8"),
        readFile(new URL(resource.modal, import.meta.url), "utf8"),
      ]);

      expect(index).toContain(resource.addHref);
      expect(index).not.toContain(`<${resource.form}`);
      expect(create).toContain(`<${resource.form}`);
      expect(detail).toContain(`<${resource.form}`);
      expect(detail).toContain("notFound()");
      expect(create).toContain("ControlBackLink");
      expect(detail).toContain("ControlBackLink");
      expect(modal).toContain("ControlModalRoute");
    }
  });

  it("moves operational mutation forms behind record modal routes", async () => {
    const cases = [
      {
        index: "../app/(shop)/control/pricing/page.tsx",
        record: "../app/(shop)/control/pricing/products/[productId]/page.tsx",
        modal: "../app/(shop)/control/@modal/(.)pricing/products/[productId]/page.tsx",
        mutation: "setProductPrice",
      },
      {
        index: "../app/(shop)/control/supply/page.tsx",
        record: "../app/(shop)/control/supply/inventory/[productId]/page.tsx",
        modal: "../app/(shop)/control/@modal/(.)supply/inventory/[productId]/page.tsx",
        mutation: "updateInventory",
      },
      {
        index: "../app/(shop)/control/finance/page.tsx",
        record: "../app/(shop)/control/finance/reconciliations/new/page.tsx",
        modal: "../app/(shop)/control/@modal/(.)finance/reconciliations/new/page.tsx",
        mutation: "ManualReconciliationForm",
      },
      {
        index: "../app/(shop)/control/orders/allocations/page.tsx",
        record: "../app/(shop)/control/orders/allocations/[productId]/page.tsx",
        modal: "../app/(shop)/control/@modal/(.)orders/allocations/[productId]/page.tsx",
        mutation: "confirmPreorderAllocation",
      },
    ];

    for (const item of cases) {
      const [index, record, modal] = await Promise.all([
        readFile(new URL(item.index, import.meta.url), "utf8"),
        readFile(new URL(item.record, import.meta.url), "utf8"),
        readFile(new URL(item.modal, import.meta.url), "utf8"),
      ]);
      expect(index).not.toContain(item.mutation);
      expect(record).toContain(item.mutation);
      expect(modal).toContain("ControlModalRoute");
    }
  });

  it("provides an accessible dismissible modal layer from the control layout", async () => {
    const [layout, modal, defaultSlot] = await Promise.all([
      readFile(new URL("../app/(shop)/control/layout.tsx", import.meta.url), "utf8"),
      readFile(
        new URL("../app/(shop)/control/_components/control-modal-route.tsx", import.meta.url),
        "utf8"
      ),
      readFile(new URL("../app/(shop)/control/@modal/default.tsx", import.meta.url), "utf8"),
    ]);
    expect(layout).toContain("modal?: ReactNode");
    expect(layout).toContain("{modal}");
    expect(defaultSlot).toContain("return null");
    expect(modal).toContain('role="dialog"');
    expect(modal).toContain('aria-modal="true"');
    expect(modal).toContain('event.key === "Escape"');
    expect(modal).toContain("router.back()");
    expect(modal).toContain('document.body.style.overflow = "hidden"');
  });

  it("intercepts every create and record editor into the shared modal layer", async () => {
    const modalRoutes = [
      "catalog/products/new",
      "catalog/products/[productId]",
      "catalog/categories/new",
      "catalog/categories/[categoryId]",
      "catalog/sets/new",
      "catalog/sets/[setId]",
      "pricing/products/[productId]",
      "pricing/deals/new",
      "pricing/deals/[dealId]",
      "storefront/listings/[productId]",
      "storefront/listings/configurations/[configurationKey]",
      "supply/inventory/[productId]",
      "supply/purchase-orders/new",
      "supply/purchase-orders/[purchaseOrderId]",
      "supply/suppliers/new",
      "supply/suppliers/[supplierId]",
      "orders/normal/[orderId]",
      "orders/preorders/[preorderId]",
      "orders/allocations/[productId]",
      "fulfilment/deliveries/[orderId]",
      "customers/[customerId]",
      "finance/reconciliations/new",
      "finance/exceptions/[exceptionKey]",
      "governance/administrators/new",
      "governance/administrators/[grantId]",
    ];

    for (const route of modalRoutes) {
      const source = await readFile(
        new URL(`../app/(shop)/control/@modal/(.)${route}/page.tsx`, import.meta.url),
        "utf8"
      );
      expect(source).toContain("ControlModalRoute");
    }
  });

  it("keeps lifecycle mutations out of resource listings", async () => {
    const cases = [
      ["../app/(shop)/control/catalog/categories/page.tsx", "setControlCategoryActive"],
      ["../app/(shop)/control/catalog/sets/page.tsx", "setControlSetActive"],
      ["../app/(shop)/control/supply/suppliers/page.tsx", "setControlSupplierActive"],
      ["../app/(shop)/control/pricing/page.tsx", "setProductPrice"],
      ["../app/(shop)/control/supply/page.tsx", "recordSupplierPurchaseOrder"],
      ["../app/(shop)/control/finance/page.tsx", "runAdminOrderAction"],
      ["../app/(shop)/control/orders/allocations/page.tsx", "confirmPreorderAllocation"],
    ] as const;

    for (const [path, mutation] of cases) {
      const source = await readFile(new URL(path, import.meta.url), "utf8");
      expect(source).not.toContain(mutation);
    }
  });

  it("moves record-specific operational editors off queue pages", async () => {
    const [
      listings,
      listingDetail,
      configurationDetail,
      deliveries,
      deliveryDetail,
      customers,
      customerDetail,
    ] = await Promise.all([
      readFile(
        new URL("../app/(shop)/control/storefront/listings/page.tsx", import.meta.url),
        "utf8"
      ),
      readFile(
        new URL("../app/(shop)/control/storefront/listings/[productId]/page.tsx", import.meta.url),
        "utf8"
      ),
      readFile(
        new URL(
          "../app/(shop)/control/storefront/listings/configurations/[configurationKey]/page.tsx",
          import.meta.url
        ),
        "utf8"
      ),
      readFile(
        new URL("../app/(shop)/control/fulfilment/deliveries/page.tsx", import.meta.url),
        "utf8"
      ),
      readFile(
        new URL("../app/(shop)/control/fulfilment/deliveries/[orderId]/page.tsx", import.meta.url),
        "utf8"
      ),
      readFile(new URL("../app/(shop)/control/customers/page.tsx", import.meta.url), "utf8"),
      readFile(
        new URL("../app/(shop)/control/customers/[customerId]/page.tsx", import.meta.url),
        "utf8"
      ),
    ]);

    expect(listings).not.toContain("<ListingItemForm");
    expect(listings).not.toContain("<StorefrontConfigurationForm");
    expect(listingDetail).toContain("<ListingItemForm");
    expect(configurationDetail).toContain("<StorefrontConfigurationForm");

    expect(deliveries).not.toContain("arrangeDelivery");
    expect(deliveries).not.toContain("updateDeliveryStatus");
    expect(deliveryDetail).toContain("<DeliveryEditor");

    expect(customers).not.toContain("<CustomerLifecycleControl");
    expect(customerDetail).toContain("<CustomerLifecycleControl");
  });

  it("redirects created resources to their stable detail routes", async () => {
    const [controlActions, adminActions, deliveries] = await Promise.all([
      readFile(new URL("../app/actions/control.ts", import.meta.url), "utf8"),
      readFile(new URL("../app/actions/admin.ts", import.meta.url), "utf8"),
      readFile(new URL("../lib/deliveries.ts", import.meta.url), "utf8"),
    ]);

    expect(controlActions).toContain("/control/supply/suppliers/${supplierId}?saved=1");
    expect(controlActions).toContain("/control/catalog/categories/${categoryId}?saved=1");
    expect(controlActions).toContain("/control/catalog/sets/${setId}?saved=1");
    expect(controlActions).toContain("/control/governance/administrators/${grantId}?saved=1");
    expect(controlActions).toContain('readRpcId(data, "supplier_id")');
    expect(controlActions).toContain('readRpcId(data, "category_id")');
    expect(controlActions).toContain('readRpcId(data, "set_id")');
    expect(controlActions).toContain('readRpcId(data, "grant_id")');

    expect(adminActions).toContain("/control/pricing/deals/${dealId}?saved=1");
    expect(adminActions).toContain("/control/storefront/listings/${input.productId}?saved=1");
    expect(adminActions).toContain(
      "/control/storefront/listings/configurations/${encodeURIComponent(input.key)}?saved=1"
    );
    expect(deliveries).toContain("getAdminDeliveryOrder");
    expect(deliveries).toContain('.eq("id", orderId)');
  });
});
