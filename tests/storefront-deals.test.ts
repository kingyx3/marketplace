import { describe, expect, it } from "vitest";

import type { LimitedTimeDeal } from "@/lib/deals";
import { indexBestDealsBySku } from "@/lib/storefront-deals";

describe("storefront deal indexing", () => {
  it("keeps the lowest eligible price for each SKU", () => {
    const indexed = indexBestDealsBySku([
      deal({ id: "later", dealPriceCents: 18900, discountBps: 500 }),
      deal({ id: "best", dealPriceCents: 17900, discountBps: 1000 }),
      deal({ id: "other", sku: "OTHER-SKU", dealPriceCents: 9900 }),
    ]);

    expect(indexed.get("TEST-SKU")?.id).toBe("best");
    expect(indexed.get("OTHER-SKU")?.id).toBe("other");
  });

  it("uses the earlier expiry when prices match", () => {
    const indexed = indexBestDealsBySku([
      deal({ id: "later", endsAt: "2026-08-20T00:00:00.000Z" }),
      deal({ id: "earlier", endsAt: "2026-08-10T00:00:00.000Z" }),
    ]);

    expect(indexed.get("TEST-SKU")?.id).toBe("earlier");
  });
});

function deal(overrides: Partial<LimitedTimeDeal>): LimitedTimeDeal {
  return {
    id: "deal",
    code: "deal",
    skuId: "11111111-1111-4111-8111-111111111111",
    sku: "TEST-SKU",
    productName: "Test product",
    productSlug: "test-product",
    productImageUrl: null,
    title: "Sale",
    description: null,
    discountBps: 500,
    visibility: "public",
    startsAt: "2026-07-01T00:00:00.000Z",
    endsAt: "2026-08-31T00:00:00.000Z",
    regularPriceCents: 19900,
    dealPriceCents: 18900,
    savingsCents: 1000,
    currency: "SGD",
    ...overrides,
  };
}
