import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  orderItemCount,
  orderTimeline,
  preorderStatusLabel,
  preorderStatusMessage,
  productHrefForItem,
  productNameForItem,
  type LiveOrder,
  type LivePreorder,
} from "@/lib/order-display";

const authenticatedPages = [
  "app/(shop)/account/page.tsx",
  "app/(shop)/orders/page.tsx",
  "app/(shop)/orders/[id]/page.tsx",
  "app/(shop)/preorders/page.tsx",
];

describe("live customer pages", () => {
  it("does not import fixture order or preorder data into authenticated pages", async () => {
    for (const path of authenticatedPages) {
      const source = await readFile(new URL(`../${path}`, import.meta.url), "utf8");
      expect(source).not.toContain("@/app/_data/marketplace-fixtures");
    }
  });

  it("consolidates preorder history under orders", async () => {
    const [ordersPage, preorderRedirect, header] = await Promise.all([
      readFile(new URL("../app/(shop)/orders/page.tsx", import.meta.url), "utf8"),
      readFile(new URL("../app/(shop)/preorders/page.tsx", import.meta.url), "utf8"),
      readFile(new URL("../app/_components/site-header.tsx", import.meta.url), "utf8"),
    ]);

    expect(ordersPage).toContain("listCustomerPreorders");
    expect(ordersPage).toContain('id="preorders"');
    expect(preorderRedirect).toContain('redirect("/orders#preorders")');
    expect(header).not.toContain('href="/preorders"');
  });

  it("derives customer order display fields from live Supabase-shaped rows", () => {
    const order: LiveOrder = {
      id: "order-live",
      channel: "b2c",
      status: "paid",
      currency: "SGD",
      subtotal_cents: 19900,
      total_cents: 19900,
      placed_at: "2026-07-04T01:00:00.000Z",
      created_at: "2026-07-04T00:59:00.000Z",
      order_items: [
        {
          id: "line-1",
          sku_id: "sku-1",
          quantity: 2,
          unit_price_cents: 9950,
          booster_box_skus: {
            sku: "MTG-SMP-PBB-EN",
            product_variants: {
              products: {
                slug: "smp-play-booster-box",
                name: "Sample Set Play Booster Box",
              },
            },
          },
        },
      ],
      payments: [{ status: "captured", captured_at: "2026-07-04T01:01:00.000Z" }],
      shipments: [],
    };

    expect(orderItemCount(order)).toBe(2);
    expect(productNameForItem(order.order_items![0]!)).toBe("Sample Set Play Booster Box");
    expect(productHrefForItem(order.order_items![0]!)).toBe("/products/smp-play-booster-box");
    expect(orderTimeline(order).map((item) => item.label)).toEqual([
      "Created",
      "Payment",
      "Packing",
      "Shipped",
      "Delivered",
    ]);
  });

  it("derives customer preorder display fields from live Supabase-shaped rows", () => {
    const preorder: LivePreorder = {
      id: "pre-live",
      sku_id: "sku-2",
      channel: "b2c",
      quantity: 1,
      unit_price_cents: 21400,
      deposit_cents: 4280,
      balance_cents: 17120,
      currency: "SGD",
      status: "balance_due",
      allocated_qty: 1,
      order_id: null,
      created_at: "2026-07-04T02:00:00.000Z",
      booster_box_skus: {
        sku: "LOR-AUR-BB-EN",
        product_variants: {
          products: {
            slug: "aurora-booster-box",
            name: "Aurora Skies Booster Box",
          },
        },
      },
      payments: [{ kind: "deposit", status: "authorized", created_at: "2026-07-04T02:01:00.000Z" }],
    };

    expect(productNameForItem(preorder)).toBe("Aurora Skies Booster Box");
    expect(productHrefForItem(preorder)).toBe("/products/aurora-booster-box");
    expect(preorderStatusLabel(preorder.status)).toBe("Payment required");
    expect(preorderStatusMessage(preorder)).toBe(
      "Payment is still needed before this preorder can move forward."
    );
  });

  it("translates active preorder states into customer outcomes", () => {
    const preorder = {
      id: "pre-live",
      sku_id: "sku-2",
      channel: "b2c",
      quantity: 3,
      unit_price_cents: 21400,
      deposit_cents: 64200,
      balance_cents: 0,
      allocation_refund_cents: 21400,
      currency: "SGD",
      status: "refund_pending",
      allocated_qty: 2,
      created_at: "2026-07-04T02:00:00.000Z",
    } satisfies LivePreorder;

    expect(preorderStatusLabel(preorder.status)).toBe("Refund in progress");
    expect(preorderStatusMessage(preorder)).toContain(
      "confirmed 2 of 3 and are returning the difference"
    );
    expect(preorderStatusLabel("new_internal_state")).toBe("Update available");
  });
});
