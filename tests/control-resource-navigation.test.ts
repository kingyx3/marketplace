import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("list-first control resources", () => {
  it("keeps CRUD index pages focused on navigation", async () => {
    const resources = [
      {
        index: "../app/(shop)/control/supply/suppliers/page.tsx",
        create: "../app/(shop)/control/supply/suppliers/new/page.tsx",
        detail: "../app/(shop)/control/supply/suppliers/[supplierId]/page.tsx",
        form: "SupplierForm",
        addHref: "/control/supply/suppliers/new",
      },
      {
        index: "../app/(shop)/control/catalog/categories/page.tsx",
        create: "../app/(shop)/control/catalog/categories/new/page.tsx",
        detail: "../app/(shop)/control/catalog/categories/[categoryId]/page.tsx",
        form: "CategoryForm",
        addHref: "/control/catalog/categories/new",
      },
      {
        index: "../app/(shop)/control/catalog/sets/page.tsx",
        create: "../app/(shop)/control/catalog/sets/new/page.tsx",
        detail: "../app/(shop)/control/catalog/sets/[setId]/page.tsx",
        form: "SetForm",
        addHref: "/control/catalog/sets/new",
      },
      {
        index: "../app/(shop)/control/governance/administrators/page.tsx",
        create: "../app/(shop)/control/governance/administrators/new/page.tsx",
        detail: "../app/(shop)/control/governance/administrators/[grantId]/page.tsx",
        form: "AdministratorGrantForm",
        addHref: "/control/governance/administrators/new",
      },
      {
        index: "../app/(shop)/control/pricing/deals/page.tsx",
        create: "../app/(shop)/control/pricing/deals/new/page.tsx",
        detail: "../app/(shop)/control/pricing/deals/[dealId]/page.tsx",
        form: "DealForm",
        addHref: "/control/pricing/deals/new",
      },
    ];

    for (const resource of resources) {
      const [index, create, detail] = await Promise.all([
        readFile(new URL(resource.index, import.meta.url), "utf8"),
        readFile(new URL(resource.create, import.meta.url), "utf8"),
        readFile(new URL(resource.detail, import.meta.url), "utf8"),
      ]);

      expect(index).toContain(resource.addHref);
      expect(index).not.toContain(`<${resource.form}`);
      expect(create).toContain(`<${resource.form}`);
      expect(detail).toContain(`<${resource.form}`);
      expect(detail).toContain("notFound()");
      expect(create).toContain("ControlBackLink");
      expect(detail).toContain("ControlBackLink");
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
