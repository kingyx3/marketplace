import { describe, expect, it } from "vitest";

import { checkoutOrderRpcParams } from "@/lib/order-checkout";
import {
  calculateDepositCents,
  calculateDiscountCents,
  normalizeCartItems,
  quoteCheckout,
  type CheckoutQuote,
} from "@/lib/commerce";

const shippingAddress = {
  recipientName: "Buyer",
  line1: "1 Market Street",
  city: "Singapore",
  postalCode: "048940",
  countryCode: "SG",
};

const productId = "11111111-1111-4111-8111-111111111111";

describe("commerce helpers", () => {
  it("merges duplicate cart lines without changing first-seen ordering", () => {
    expect(
      normalizeCartItems([
        { productId: "referenceCode-a", quantity: 1 },
        { productId: "referenceCode-b", quantity: 2 },
        { productId: "referenceCode-a", quantity: 3 },
      ])
    ).toEqual([
      { productId: "referenceCode-a", quantity: 4, position: 0 },
      { productId: "referenceCode-b", quantity: 2, position: 1 },
    ]);
  });

  it("calculates integer-cent discounts and full upfront preorder payment", () => {
    expect(calculateDiscountCents(19900, 800)).toBe(1592);
    expect(calculateDiscountCents(19900, 0)).toBe(0);
    expect(calculateDepositCents(19900)).toBe(19900);
    expect(calculateDepositCents(1)).toBe(1);
    expect(calculateDepositCents(0)).toBe(0);
  });

  it("rejects carts over the database checkout quantity limit", () => {
    expect(() =>
      normalizeCartItems([
        { productId: "referenceCode-a", quantity: 13 },
        { productId: "referenceCode-b", quantity: 12 },
      ])
    ).toThrow("Cart quantity exceeds 24");
  });

  it("passes retail pricing and shipping into the checkout order RPC", () => {
    const quote: CheckoutQuote = {
      mode: "order",
      channel: "b2c",
      currency: "SGD",
      lines: [
        {
          productId,
          referenceCode: "BOX-1",
          productName: "Booster Box",
          quantity: 2,
          unitPriceCents: 19900,
          lineTotalCents: 39800,
          currency: "SGD",
          availableToSell: 4,
        },
      ],
      subtotalCents: 39800,
      discountBps: 500,
      discountCents: 1990,
      shippingCents: 800,
      shippingService: "Tracked delivery",
      shippingPolicyKey: "shipping_policy",
      taxCents: 3188,
      totalCents: 38610,
      depositCents: 38610,
      balanceCents: 0,
    };

    expect(checkoutOrderRpcParams("user-123", quote, shippingAddress)).toEqual({
      p_auth_user_id: "user-123",
      p_items: [{ product_id: productId, quantity: 2 }],
      p_channel: "b2c",
      p_shipping_address: shippingAddress,
      p_expected_subtotal_cents: 39800,
      p_discount_cents: 1990,
      p_discount_bps: 500,
      p_expected_total_cents: 38610,
    });
  });

  it("applies the lowest active deal price to retail checkout", async () => {
    const supabase = fakeQuoteSupabase({
      deals: [
        {
          product_id: productId,
          deal_price_cents: 18905,
          products: { price_cents: 19900 },
        },
        {
          product_id: productId,
          deal_price_cents: 17910,
          products: { price_cents: 19900 },
        },
      ],
    });

    await expect(
      quoteCheckout(
        supabase as never,
        {
          mode: "order",
          channel: "b2c",
          shippingAddress,
          items: [{ productId, quantity: 1 }],
        },
        customerRecord()
      )
    ).resolves.toMatchObject({
      channel: "b2c",
      subtotalCents: 19900,
      discountBps: 1000,
      discountCents: 1990,
      shippingCents: 800,
      totalCents: 18710,
    });
  });

  it("quotes preorders at 100% upfront with no balance due", async () => {
    const supabase = fakeQuoteSupabase({});

    await expect(
      quoteCheckout(
        supabase as never,
        {
          mode: "preorder",
          channel: "b2c",
          items: [{ productId, quantity: 2 }],
        },
        customerRecord()
      )
    ).resolves.toMatchObject({
      totalCents: 39800,
      depositCents: 39800,
      balanceCents: 0,
    });
  });

  it("fails closed when shipping is inactive", async () => {
    const supabase = fakeQuoteSupabase({ shippingActive: false });

    await expect(
      quoteCheckout(
        supabase as never,
        {
          mode: "order",
          channel: "b2c",
          shippingAddress,
          items: [{ productId, quantity: 1 }],
        },
        customerRecord()
      )
    ).rejects.toThrow("Shipping checkout is not configured");
  });

  it("rejects inactive products before creating payment state", async () => {
    const supabase = fakeQuoteSupabase({ productActive: false });

    await expect(
      quoteCheckout(
        supabase as never,
        {
          mode: "order",
          channel: "b2c",
          shippingAddress,
          items: [{ productId, quantity: 1 }],
        },
        customerRecord()
      )
    ).rejects.toThrow("Product is not active");
  });
});

function customerRecord() {
  return {
    id: "customer-123",
    auth_user_id: "auth-user-123",
    email: "buyer@example.test",
    name: "Buyer",
    phone: null,
    segment: "collector",
    default_currency: "SGD",
    marketing_opt_in: false,
  };
}

type DealFixture = {
  product_id: string;
  deal_price_cents: number;
  products: { price_cents: number };
};

function fakeQuoteSupabase(options: {
  deals?: DealFixture[];
  productActive?: boolean;
  shippingActive?: boolean;
}) {
  return {
    from(table: string) {
      return tableBuilder(table, options);
    },
  };
}

function tableBuilder(
  table: string,
  options: {
    deals?: DealFixture[];
    productActive?: boolean;
    shippingActive?: boolean;
  }
) {
  const builder = {
    select: () => builder,
    eq: () => builder,
    lte: () => builder,
    gt: () => builder,
    limit: () => builder,
    in: () => builder,
    order: () =>
      table === "limited_time_deals"
        ? Promise.resolve({ data: options.deals ?? [], error: null })
        : builder,
    maybeSingle: async () => {
      if (table === "product_inventory") {
        return {
          data: { on_hand: 10, allocated: 0, incoming: 10, safety_stock: 0, available: 10 },
          error: null,
        };
      }
      if (table === "storefront_configurations") {
        return {
          data: {
            active: options.shippingActive ?? true,
            value: {
              enabled: true,
              currency: "SGD",
              supportedCountryCodes: ["SG"],
              flatRateCents: 800,
              freeShippingThresholdCents: null,
              serviceName: "Tracked delivery",
            },
          },
          error: null,
        };
      }
      return { data: null, error: null };
    },
    single: async () => {
      if (table === "products") {
        return {
          data: {
            id: productId,
            reference_code: "BOX-1",
            name: "Booster Box",
            active: options.productActive ?? true,
            price_cents: 19900,
            currency: "SGD",
          },
          error: null,
        };
      }
      return { data: null, error: null };
    },
  };

  return builder;
}
