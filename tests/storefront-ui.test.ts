import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const storefrontFiles = [
  "../app/page.tsx",
  "../app/(shop)/account/page.tsx",
  "../app/(shop)/preorders/page.tsx",
];

const internalStorefrontLabels = [
  "Manual capture flow",
  "Live stock and preorders",
  "formatStatus(customer.provisioning_state)",
  "provisioningTone(customer.provisioning_state)",
  "{preorder.id}</h2>",
  "skuForItem(preorder) ?? preorder.sku_id",
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
