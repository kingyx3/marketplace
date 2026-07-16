import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("control operations surface", () => {
  it("keeps production operations retail-only", async () => {
    const source = await readFile(
      new URL("../app/(shop)/control/operations/page.tsx", import.meta.url),
      "utf8"
    );

    expect(source).not.toContain("@/app/_data/marketplace-fixtures");
    expect(source).not.toContain("Wholesale");
    expect(source).not.toContain("B2B");
    expect(source).not.toContain("pricingTierId");
    expect(source).not.toContain("/admin");
    expect(source).toContain("requireControlPermission");
    expect(source).toContain("listAdminOrderExceptions");
    expect(source).toContain("fetchInventoryRows");
    expect(source).toContain("fetchProducts");
    expect(source).toContain("fetchCategories");
    expect(source).toContain("fetchSets");
    expect(source).toContain("fetchPurchaseOrders");
    expect(source).toContain("fetchSuppliers");
    expect(source).toContain("runAdminOrderAction");
    expect(source).toContain("recordSupplierPurchaseOrder");
    expect(source).toContain("upsertCatalogProduct");
    expect(source).toContain("upsertCatalogSku");
    expect(source).toContain("uploadCatalogProductImage");
    expect(source).toContain("setCatalogProductActive");
    expect(source).toContain("setCatalogSkuActive");
    expect(source).toContain("CatalogSection");
    expect(source).toContain("ManualReconciliationForm");
    expect(source).toContain("PurchaseOrdersSection");
    expect(source).toContain("Create product");
    expect(source).toContain("Upload");
    expect(source).toContain('noun="SKU"');
    expect(source).toContain("Record purchase order");
  });
});