import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("list-first control resources", () => {
  it("keeps CRUD index pages focused on navigation", async () => {
    const resources = [
      {
        index: "../app/(shop)/control/suppliers/page.tsx",
        create: "../app/(shop)/control/suppliers/new/page.tsx",
        detail: "../app/(shop)/control/suppliers/[supplierId]/page.tsx",
        form: "SupplierForm",
        addHref: "/control/suppliers/new",
      },
      {
        index: "../app/(shop)/control/categories/page.tsx",
        create: "../app/(shop)/control/categories/new/page.tsx",
        detail: "../app/(shop)/control/categories/[categoryId]/page.tsx",
        form: "CategoryForm",
        addHref: "/control/categories/new",
      },
      {
        index: "../app/(shop)/control/sets/page.tsx",
        create: "../app/(shop)/control/sets/new/page.tsx",
        detail: "../app/(shop)/control/sets/[setId]/page.tsx",
        form: "SetForm",
        addHref: "/control/sets/new",
      },
      {
        index: "../app/(shop)/control/administrators/page.tsx",
        create: "../app/(shop)/control/administrators/new/page.tsx",
        detail: "../app/(shop)/control/administrators/[grantId]/page.tsx",
        form: "AdministratorGrantForm",
        addHref: "/control/administrators/new",
      },
      {
        index: "../app/(shop)/control/deals/page.tsx",
        create: "../app/(shop)/control/deals/new/page.tsx",
        detail: "../app/(shop)/control/deals/[dealId]/page.tsx",
        form: "DealForm",
        addHref: "/control/deals/new",
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
    const [listings, listingDetail, configurationDetail, deliveries, deliveryDetail, customers, customerDetail] =
      await Promise.all([
        readFile(new URL("../app/(shop)/control/listings/page.tsx", import.meta.url), "utf8"),
        readFile(
          new URL("../app/(shop)/control/listings/[productId]/page.tsx", import.meta.url),
          "utf8"
        ),
        readFile(
          new URL(
            "../app/(shop)/control/listings/configurations/[configurationKey]/page.tsx",
            import.meta.url
          ),
          "utf8"
        ),
        readFile(new URL("../app/(shop)/control/deliveries/page.tsx", import.meta.url), "utf8"),
        readFile(
          new URL("../app/(shop)/control/deliveries/[orderId]/page.tsx", import.meta.url),
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

    expect(controlActions).toContain("/control/suppliers/${supplierId}?saved=1");
    expect(controlActions).toContain("/control/categories/${categoryId}?saved=1");
    expect(controlActions).toContain("/control/sets/${setId}?saved=1");
    expect(controlActions).toContain("/control/administrators/${grantId}?saved=1");
    expect(controlActions).toContain('readRpcId(data, "supplier_id")');
    expect(controlActions).toContain('readRpcId(data, "category_id")');
    expect(controlActions).toContain('readRpcId(data, "set_id")');
    expect(controlActions).toContain('readRpcId(data, "grant_id")');

    expect(adminActions).toContain("/control/deals/${dealId}?saved=1");
    expect(adminActions).toContain("/control/listings/${input.productId}?saved=1");
    expect(adminActions).toContain("/control/listings/configurations/${encodeURIComponent(input.key)}?saved=1");
    expect(deliveries).toContain("getAdminDeliveryOrder");
    expect(deliveries).toContain('.eq("id", orderId)');
  });
});
