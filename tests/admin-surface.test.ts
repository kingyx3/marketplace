import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("admin surface", () => {
  it("keeps production operations while removing wholesale controls", async () => {
    const source = await readFile(
      new URL("../app/(shop)/admin/page.tsx", import.meta.url),
      "utf8"
    );

    expect(source).not.toContain("@/app/_data/marketplace-fixtures");
    expect(source).not.toContain("Wholesale");
    expect(source).not.toContain("B2B");
    expect(source).not.toContain("pricingTierId");
    expect(source).toContain("listAdminOrderExceptions");
    expect(source).toContain("fetchInventoryRows");
    expect(source).toContain("fetchCatalogProducts");
    expect(source).toContain("fetchCategoryOptions");
    expect(source).toContain("fetchSetOptions");
    expect(source).toContain("fetchPurchaseOrders");
    expect(source).toContain("fetchSupplierOptions");
    expect(source).toContain("runAdminOrderAction");
    expect(source).toContain("recordSupplierPurchaseOrder");
    expect(source).toContain("upsertCatalogProduct");
    expect(source).toContain("upsertCatalogSku");
    expect(source).toContain("uploadCatalogProductImage");
    expect(source).toContain("setCatalogProductActive");
    expect(source).toContain("setCatalogSkuActive");
    expect(source).toContain("CatalogManagementSection");
    expect(source).toContain("ManualReconciliationForm");
    expect(source).toContain("PurchaseOrdersSection");
    expect(source).toContain("Create product");
    expect(source).toContain("Upload");
    expect(source).toContain("Archive SKU");
    expect(source).toContain("Record purchase order");
  });
});
