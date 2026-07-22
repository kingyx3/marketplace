import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const storefrontFiles = [
  "../app/page.tsx",
  "../app/(shop)/account/page.tsx",
  "../app/(shop)/orders/page.tsx",
  "../app/(shop)/orders/[id]/page.tsx",
  "../app/(shop)/cart/page.tsx",
  "../app/(shop)/products/[slug]/page.tsx",
  "../app/_components/product-card.tsx",
  "../app/_components/site-footer.tsx",
  "../app/_components/site-header.tsx",
];

const internalStorefrontLabels = [
  "Manual capture flow",
  "Live stock and preorders",
  "formatStatus(customer.provisioning_state)",
  "provisioningTone(customer.provisioning_state)",
  "{preorder.id}</h2>",
  "skuForItem(preorder) ?? preorder.product_id",
  '<ProductFact label="product"',
  "{line.referenceCode}",
  "skuForItem(line)",
  "Drop alerts",
  "CookiePreferences",
];

describe("storefront UI boundaries", () => {
  it("does not expose internal operating-state labels to customers", async () => {
    const sources = await Promise.all(
      storefrontFiles.map((path) => readFile(new URL(path, import.meta.url), "utf8"))
    );
    const storefrontSource = sources.join("\n");

    for (const label of internalStorefrontLabels) {
      expect(storefrontSource).not.toContain(label);
    }
  });

  it("uses one customer-facing preorder availability badge", async () => {
    const [productPage, productCard] = await Promise.all([
      readFile(new URL("../app/(shop)/products/[slug]/page.tsx", import.meta.url), "utf8"),
      readFile(new URL("../app/_components/product-card.tsx", import.meta.url), "utf8"),
    ]);

    expect(productPage).not.toContain("formatStatus(product.setStatus)");
    expect(productCard).not.toContain("formatStatus(product.setStatus)");
    expect(productPage).toContain("availability.label");
    expect(productCard).toContain("availability.label");
    expect(productPage).toContain("Add to cart");
    expect(productPage).toContain('startLabel="Place Order"');
  });

  it("documents internal operating details outside the storefront", async () => {
    const documentation = await readFile(
      new URL("../docs/storefront-ui.md", import.meta.url),
      "utf8"
    );

    expect(documentation).toContain("manual or automated capture flows");
    expect(documentation).toContain("customer provisioning state");
    expect(documentation).toContain("Customer-visible statuses");
  });
});
