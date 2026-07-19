import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("control operations surface", () => {
  it("keeps the operations landing page focused on product navigation", async () => {
    const [operations, productDetail, productEditor, newProduct] = await Promise.all([
      readFile(new URL("../app/(shop)/control/operations/page.tsx", import.meta.url), "utf8"),
      readFile(
        new URL(
          "../app/(shop)/control/operations/products/[productId]/page.tsx",
          import.meta.url
        ),
        "utf8"
      ),
      readFile(
        new URL(
          "../app/(shop)/control/_components/catalog-product-editor.tsx",
          import.meta.url
        ),
        "utf8"
      ),
      readFile(
        new URL("../app/(shop)/control/operations/products/new/page.tsx", import.meta.url),
        "utf8"
      ),
    ]);

    expect(operations).not.toContain("@/app/_data/marketplace-fixtures");
    expect(operations).not.toContain("Wholesale");
    expect(operations).not.toContain("B2B");
    expect(operations).not.toContain("pricingTierId");
    expect(operations).not.toContain('href="/admin');
    expect(operations).not.toContain('requireStaff("/admin');
    expect(operations).toContain("requireControlPermission");
    expect(operations).toContain("listAdminOrderExceptions");
    expect(operations).toContain("fetchInventoryRows");
    expect(operations).toContain("fetchControlProducts");
    expect(operations).toContain("fetchControlCategories");
    expect(operations).toContain("fetchControlSets");
    expect(operations).toContain("fetchPurchaseOrders");
    expect(operations).toContain("fetchSuppliers");
    expect(operations).toContain("runAdminOrderAction");
    expect(operations).toContain("recordSupplierPurchaseOrder");
    expect(operations).toContain("ProductListSection");
    expect(operations).toContain('href="/control/operations/products/new"');
    expect(operations).toContain("Add product");
    expect(operations).toContain("Open a product to view and edit its details and related SKUs.");
    expect(operations).not.toContain("ProductIntakeForm");
    expect(operations).not.toContain("upsertCatalogProduct");
    expect(operations).not.toContain("upsertCatalogSku");
    expect(operations).toContain("ManualReconciliationForm");
    expect(operations).toContain("PurchaseOrdersSection");
    expect(operations).toContain("Record purchase order");

    expect(newProduct).toContain("ProductIntakeForm");
    expect(newProduct).toContain("After it is saved");
    expect(productDetail).toContain("CatalogProductEditor");
    expect(productDetail).toContain("CatalogSkuManager");
    expect(productEditor).toContain("upsertCatalogProduct");
    expect(productEditor).toContain("upsertCatalogSku");
    expect(productEditor).toContain("uploadCatalogProductImage");
    expect(productEditor).toContain("setCatalogProductActive");
    expect(productEditor).toContain("setCatalogSkuActive");
    expect(productEditor).toContain("Add SKU");
    expect(productEditor).toContain("Upload image");
    expect(productEditor).toContain('noun="SKU"');
  });
});
