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

describe("commerce helpers", () => {
  it("merges duplicate cart lines without changing first-seen ordering", () => {
    const items = normalizeCartItems([
      { skuId: "sku-a", quantity: 1 },
      { skuId: "sku-b", quantity: 2 },
      { skuId: "sku-a", quantity: 3 },
    ]);

    expect(items).toEqual([
      { skuId: "sku-a", quantity: 4, position: 0 },
      { skuId: "sku-b", quantity: 2, position: 1 },
    ]);
  });

  it("calculates integer-cent discounts", () => {
    expect(calculateDiscountCents(19900, 800)).toBe(1592);
    expect(calculateDiscountCents(19900, 0)).toBe(0);
  });

  it("rejects carts over the database checkout quantity limit", () => {
    expect(() =>
      normalizeCartItems([
        { skuId: "sku-a", quantity: 13 },
        { skuId: "sku-b", quantity: 12 },
      ])
    ).toThrow("Cart quantity exceeds 24");
  });

  it("uses a bounded non-zero preorder deposit", () => {
    expect(calculateDepositCents(19900)).toBe(3980);
    expect(calculateDepositCents(1)).toBe(100);
    expect(calculateDepositCents(0)).toBe(0);
  });

  it("passes server-derived pricing and address into the checkout order RPC", () => {
    const quote: CheckoutQuote = {
      mode: "order",
      channel: "b2b",
      currency: "SGD",
      lines: [
        {
          skuId: "11111111-1111-4111-8111-111111111111",
          sku: "BOX-1",
          productName: "Booster Box",
          quantity: 2,
          unitPriceCents: 19900,
          lineTotalCents: 39800,
          currency: "SGD",
          availableToSell: 4,
        },
      ],
      subtotalCents: 39800,
      discountBps: 800,
      discountCents: 3184,
      shippingCents: 800,
      shippingService: "Tracked delivery",
      shippingPolicyKey: "shipping_policy",
      taxCents: 3089,
      totalCents: 37416,
      depositCents: 37416,
      balanceCents: 0,
    };

    expect(checkoutOrderRpcParams("user-123", quote, shippingAddress)).toEqual({
      p_auth_user_id: "user-123",
      p_items: [{ sku_id: "11111111-1111-4111-8111-111111111111", quantity: 2 }],
      p_channel: "b2b",
      p_shipping_address: shippingAddress,
      p_expected_subtotal_cents: 39800,
      p_discount_cents: 3184,
      p_discount_bps: 800,
      p_expected_total_cents: 37416,
    });
  });

  it("rejects approved B2B checkout below the assigned tier minimum", async () => {
    const supabase = fakeQuoteSupabase({
      b2bApproved: true,
      tiers: [{ discount_bps: 800, min_order_cents: 50000 }],
    });

    await expect(
      quoteCheckout(
        supabase as never,
        {
          mode: "order",
          channel: "b2b",
          shippingAddress,
          items: [{ skuId: "11111111-1111-4111-8111-111111111111", quantity: 1 }],
        },
        customerRecord()
      )
    ).rejects.toThrow("B2B minimum order is 50000 cents");
  });

  it("applies assigned B2B pricing and shipping after the minimum is met", async () => {
    const supabase = fakeQuoteSupabase({
      b2bApproved: true,
      tiers: [{ discount_bps: 800, min_order_cents: 30000 }],
    });

    await expect(
      quoteCheckout(
        supabase as never,
        {
          mode: "order",
          channel: "b2b",
          shippingAddress,
          items: [{ skuId: "11111111-1111-4111-8111-111111111111", quantity: 2 }],
        },
        customerRecord()
      )
    ).resolves.toMatchObject({
      channel: "b2b",
      subtotalCents: 39800,
      discountBps: 800,
      discountCents: 3184,
      shippingCents: 800,
      shippingService: "Tracked delivery",
      totalCents: 37416,
    });
  });

  it("fails closed when shipping policy is inactive", async () => {
    const supabase = fakeQuoteSupabase({
      b2bApproved: false,
      shippingActive: false,
      tiers: [],
    });

    await expect(
      quoteCheckout(
        supabase as never,
        {
          mode: "order",
          channel: "b2c",
          shippingAddress,
          items: [{ skuId: "11111111-1111-4111-8111-111111111111", quantity: 1 }],
        },
        customerRecord()
      )
    ).rejects.toThrow("Shipping checkout is not configured");
  });

  it("rejects inactive SKUs before creating payment state", async () => {
    const supabase = fakeQuoteSupabase({
      b2bApproved: false,
      skuActive: false,
      tiers: [],
    });

    await expect(
      quoteCheckout(
        supabase as never,
        {
          mode: "order",
          channel: "b2c",
          shippingAddress,
          items: [{ skuId: "11111111-1111-4111-8111-111111111111", quantity: 1 }],
        },
        customerRecord()
      )
    ).rejects.toThrow("SKU is not active");
  });
});

function customerRecord() {
  return {
    id: "customer-123",
    auth_user_id: "auth-user-123",
    email: "buyer@example.test",
    name: "Buyer",
    phone: null,
    segment: "reseller",
    default_currency: "SGD",
    marketing_opt_in: false,
  };
}

function fakeQuoteSupabase(options: {
  b2bApproved: boolean;
  skuActive?: boolean;
  shippingActive?: boolean;
  tiers: Array<{ discount_bps: number; min_order_cents: number }>;
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
    b2bApproved: boolean;
    skuActive?: boolean;
    shippingActive?: boolean;
    tiers: Array<{ discount_bps: number; min_order_cents: number }>;
  }
) {
  const builder = {
    select: () => builder,
    eq: () => {
      if (table === "customer_pricing_tiers") {
        return Promise.resolve({
          data: [{ pricing_tier_id: "tier-123" }],
          error: null,
        });
      }
      return builder;
    },
    order: () => builder,
    limit: () => builder,
    in: () => {
      if (table === "pricing_tiers") {
        return Promise.resolve({ data: options.tiers, error: null });
      }
      return Promise.resolve({ data: [], error: null });
    },
    maybeSingle: async () => {
      if (table === "b2b_accounts") {
        return { data: { approved: options.b2bApproved }, error: null };
      }
      if (table === "inventory") {
        return {
          data: { on_hand: 10, allocated: 0, incoming: 0, safety_stock: 0, available: 10 },
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
      if (table === "booster_box_skus") {
        return {
          data: {
            id: "11111111-1111-4111-8111-111111111111",
            sku: "BOX-1",
            active: options.skuActive ?? true,
            price_cents: 19900,
            currency: "SGD",
            product_variant_id: "variant-123",
          },
          error: null,
        };
      }
      if (table === "product_variants") {
        return { data: { product_id: "product-123" }, error: null };
      }
      if (table === "products") {
        return { data: { name: "Booster Box", active: true }, error: null };
      }
      return { data: null, error: null };
    },
  };

  return builder;
}
