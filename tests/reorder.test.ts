import { readFile } from "node:fs/promises";

import { describe, expect, it, vi } from "vitest";

import { prepareReorderCart, type ReorderQuoteFunction } from "@/lib/reorder";

const PRODUCT_A = "11111111-1111-4111-8111-111111111111";
const PRODUCT_B = "22222222-2222-4222-8222-222222222222";

const readSource = (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

describe("buy again", () => {
  it("merges every historical line into the current cart after a live availability quote", async () => {
    const quote = quoteWithAvailability({ [PRODUCT_A]: 10, [PRODUCT_B]: 4 });

    const result = await prepareReorderCart(
      [{ productId: PRODUCT_A, quantity: 1 }],
      [
        { product_id: PRODUCT_A, quantity: 2 },
        { product_id: PRODUCT_B, quantity: 1 },
      ],
      quote,
    );

    expect(result).toEqual({
      ok: true,
      items: [
        { productId: PRODUCT_A, quantity: 3 },
        { productId: PRODUCT_B, quantity: 1 },
      ],
      addedLines: 2,
      addedQuantity: 3,
    });
    expect(quote).toHaveBeenCalledWith([
      { productId: PRODUCT_A, quantity: 3 },
      { productId: PRODUCT_B, quantity: 1 },
    ]);
  });

  it("leaves the cart unchanged when any reordered product is unavailable", async () => {
    const current = [{ productId: PRODUCT_A, quantity: 1 }];
    const quote = quoteWithAvailability({ [PRODUCT_A]: 10, [PRODUCT_B]: 1 });

    await expect(
      prepareReorderCart(
        current,
        [
          { product_id: PRODUCT_A, quantity: 1 },
          { product_id: PRODUCT_B, quantity: 2 },
        ],
        quote,
      ),
    ).resolves.toEqual({ ok: false, reason: "unavailable" });
    expect(current).toEqual([{ productId: PRODUCT_A, quantity: 1 }]);
  });

  it("rejects a reorder that would exceed the cart quantity limit before quoting", async () => {
    const quote = quoteWithAvailability({ [PRODUCT_A]: 30 });

    await expect(
      prepareReorderCart(
        [{ productId: PRODUCT_A, quantity: 23 }],
        [{ product_id: PRODUCT_A, quantity: 2 }],
        quote,
      ),
    ).resolves.toEqual({ ok: false, reason: "cart_limit" });
    expect(quote).not.toHaveBeenCalled();
  });

  it("derives reorder lines from an authenticated owned order instead of client product input", async () => {
    const [actions, orderPage] = await Promise.all([
      readSource("app/actions/cart.ts"),
      readSource("app/(shop)/orders/[id]/page.tsx"),
    ]);
    const start = actions.indexOf("export async function buyAgainFromOrder");
    const end = actions.indexOf("export async function updateCartQuantity", start);
    const action = actions.slice(start, end);

    expect(start).toBeGreaterThan(-1);
    expect(action).toContain("requireCustomer");
    expect(action).toContain("getCustomerOrder");
    expect(action).toContain("prepareReorderCart");
    expect(action).toContain("writeCart(preparation.items)");
    expect(action).not.toContain('formData.get("productId")');
    expect(orderPage).toContain("action={buyAgainFromOrder}");
    expect(orderPage).toContain("Buy these items again");
    expect(orderPage).toContain("Your cart was not changed");
  });
});

function quoteWithAvailability(
  availability: Record<string, number>,
): ReturnType<typeof vi.fn<ReorderQuoteFunction>> {
  return vi.fn<ReorderQuoteFunction>(async (items) => ({
    lines: items.map((item) => ({
      ...item,
      available: availability[item.productId] ?? 0,
    })),
  }));
}
