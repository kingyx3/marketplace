import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

import { getStorefrontAvailability } from "@/lib/storefront-availability";

describe("storefront availability", () => {
  it("does not sell incoming stock as a normal order", () => {
    expect(
      getStorefrontAvailability({
        setStatus: "released",
        onHand: 0,
        incoming: 20,
        allocated: 0,
        safetyStock: 0,
      })
    ).toMatchObject({
      available: 0,
      kind: "out_of_stock",
      purchasable: false,
      showWaitlist: true,
    });
  });

  it("uses incoming allocation only for an open preorder", () => {
    expect(
      getStorefrontAvailability({
        setStatus: "preorder_open",
        onHand: 0,
        incoming: 12,
        allocated: 3,
        safetyStock: 1,
      })
    ).toMatchObject({
      available: 8,
      kind: "preorder_available",
      mode: "preorder",
      purchasable: true,
    });
  });

  it("keeps safety stock unavailable and shows exact quantities only when low", () => {
    expect(
      getStorefrontAvailability({
        setStatus: "released",
        onHand: 8,
        incoming: 0,
        allocated: 2,
        safetyStock: 2,
      })
    ).toMatchObject({
      available: 4,
      kind: "low_stock",
      label: "Only 4 left",
      mode: "order",
      purchasable: true,
    });
  });

  it("does not enable ordering before the announced product opens", () => {
    expect(
      getStorefrontAvailability({
        setStatus: "announced",
        onHand: 20,
        incoming: 0,
        allocated: 0,
        safetyStock: 0,
      })
    ).toMatchObject({
      available: 0,
      kind: "coming_soon",
      purchasable: false,
      showWaitlist: true,
    });
  });

  it("applies the same rules across product, cart, and checkout surfaces", async () => {
    const [productPage, productCard, dealCard, cartPage, cartAction, catalog, reservations] =
      await Promise.all([
        readFile(
          new URL("../app/(shop)/products/[slug]/page.tsx", import.meta.url),
          "utf8"
        ),
        readFile(new URL("../app/_components/product-card.tsx", import.meta.url), "utf8"),
        readFile(new URL("../app/_components/deal-card.tsx", import.meta.url), "utf8"),
        readFile(new URL("../app/(shop)/cart/page.tsx", import.meta.url), "utf8"),
        readFile(new URL("../app/actions/cart.ts", import.meta.url), "utf8"),
        readFile(new URL("../lib/catalog.ts", import.meta.url), "utf8"),
        readFile(
          new URL("../supabase/migrations/20260718150100_checkout_reservations.sql", import.meta.url),
          "utf8"
        ),
      ]);

    expect(productPage).toContain("getStorefrontAvailability");
    expect(productPage).toContain("availability.showWaitlist");
    expect(productPage).not.toContain('<StockRow label="On hand"');
    expect(productPage).not.toContain('<StockRow label="Incoming"');
    expect(productPage).not.toContain('<StockRow label="Allocated"');
    expect(productCard).toContain("availability.label");
    expect(dealCard).toContain("availability.label");
    expect(cartPage).toContain("hasAvailabilityIssue");
    expect(cartPage).toContain("Checkout is disabled until unavailable quantities are corrected.");
    expect(cartAction).toContain("requestedQuantityAvailable");
    expect(cartAction).toContain("getSkuQuote(nextCart)");
    expect(catalog).toContain("inventory.available - inventory.safety_stock");
    expect(catalog).not.toContain("inventory.available + inventory.incoming");
    expect(reservations).toContain("now() + interval '15 minutes'");
    expect(reservations).toContain("for update skip locked");
  });
});
