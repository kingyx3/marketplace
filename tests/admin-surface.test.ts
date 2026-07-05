import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("admin surface", () => {
  it("uses live admin queues instead of fixture work queues", async () => {
    const source = await readFile(
      new URL("../app/(shop)/admin/page.tsx", import.meta.url),
      "utf8"
    );

    expect(source).not.toContain("@/app/_data/marketplace-fixtures");
    expect(source).toContain("listAdminOrderExceptions");
    expect(source).toContain("fetchPendingB2bApplications");
    expect(source).toContain("fetchApprovedB2bTierAssignments");
    expect(source).toContain("fetchCatalogProducts");
    expect(source).toContain("fetchCategoryOptions");
    expect(source).toContain("fetchSetOptions");
    expect(source).toContain("fetchPurchaseOrders");
    expect(source).toContain("fetchPricingTiers");
    expect(source).toContain("fetchSupplierOptions");
    expect(source).toContain("approveWholesale");
    expect(source).toContain("rejectWholesale");
    expect(source).toContain("removeWholesalePricingTier");
    expect(source).toContain("runAdminOrderAction");
    expect(source).toContain("recordSupplierPurchaseOrder");
    expect(source).toContain("upsertCatalogProduct");
    expect(source).toContain("upsertCatalogSku");
    expect(source).toContain("uploadCatalogProductImage");
    expect(source).toContain("setCatalogProductActive");
    expect(source).toContain("setCatalogSkuActive");
    expect(source).toContain("CatalogManagementSection");
    expect(source).toContain("ManualReconciliationForm");
    expect(source).toContain("PurchaseOrderIntakeForm");
    expect(source).toContain("reasonCode");
    expect(source).toContain("pricingTierId");
    expect(source).toContain("Create product");
    expect(source).toContain("Upload image");
    expect(source).toContain("Archive SKU");
    expect(source).toContain("Record incoming PO");
    expect(source).toContain("Save tier");
    expect(source).toContain("Remove tier");
  });
});
