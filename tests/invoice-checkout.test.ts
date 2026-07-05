import { describe, expect, it } from "vitest";
import { createInvoiceCheckout, invoiceCheckoutResponseBody } from "@/lib/checkout";

describe("invoice checkout", () => {
  it("creates a B2B pending-payment order with a manual invoice payment placeholder", async () => {
    const { supabase, calls } = fakeInvoiceSupabase();

    const result = await createInvoiceCheckout(
      {
        supabase: supabase as never,
        user: { id: "auth-user-123" },
        customer: {
          id: "customer-123",
          auth_user_id: "auth-user-123",
          email: "buyer@example.test",
          name: "Buyer",
          phone: null,
          segment: "reseller",
          default_currency: "SGD",
          marketing_opt_in: false,
        },
      } as never,
      {
        items: [{ skuId: "11111111-1111-4111-8111-111111111111", quantity: 2 }],
        purchaseOrderReference: "PO-1001",
      }
    );

    expect(result).toMatchObject({
      orderId: "order-123",
      provider: "manual_invoice",
      providerPaymentId: "invoice:order-123",
      amountCents: 36616,
      currency: "SGD",
      status: "pending_payment",
    });
    expect(calls.rpc).toContainEqual({
      name: "create_checkout_order_from_cart",
      params: {
        p_auth_user_id: "auth-user-123",
        p_items: [{ sku_id: "11111111-1111-4111-8111-111111111111", quantity: 2 }],
        p_channel: "b2b",
        p_expected_subtotal_cents: 39800,
        p_discount_cents: 3184,
        p_discount_bps: 800,
        p_expected_total_cents: 36616,
      },
    });
    expect(calls.insert).toContainEqual({
      table: "payments",
      payload: {
        order_id: "order-123",
        provider: "manual_invoice",
        provider_payment_id: "invoice:order-123",
        kind: "invoice",
        amount_cents: 36616,
        currency: "SGD",
        status: "pending",
      },
    });
    expect(calls.insert).toContainEqual({
      table: "audit_logs",
      payload: expect.objectContaining({
        action: "B2B_INVOICE_REQUEST",
        record_id: "order-123",
      }),
    });
  });

  it("returns only the client-safe invoice response shape", () => {
    expect(
      invoiceCheckoutResponseBody({
        orderId: "order-123",
        paymentId: "payment-123",
        provider: "manual_invoice",
        providerPaymentId: "invoice:order-123",
        amountCents: 36616,
        currency: "SGD",
        status: "pending_payment",
      })
    ).toEqual({
      orderId: "order-123",
      paymentId: "payment-123",
      provider: "manual_invoice",
      providerPaymentId: "invoice:order-123",
      amountCents: 36616,
      currency: "SGD",
      status: "pending_payment",
    });
  });
});

function fakeInvoiceSupabase() {
  const calls: {
    insert: Array<{ table: string; payload: unknown }>;
    rpc: Array<{ name: string; params: unknown }>;
  } = { insert: [], rpc: [] };

  return {
    calls,
    supabase: {
      from(table: string) {
        return tableBuilder(table, calls);
      },
      rpc(name: string, params: unknown) {
        calls.rpc.push({ name, params });
        return {
          single: async () => ({ data: { order_id: "order-123" }, error: null }),
        };
      },
    },
  };
}

function tableBuilder(
  table: string,
  calls: {
    insert: Array<{ table: string; payload: unknown }>;
    rpc: Array<{ name: string; params: unknown }>;
  }
) {
  const builder = {
    select: () => builder,
    eq: () => {
      if (table === "customer_pricing_tiers") {
        return Promise.resolve({ data: [{ pricing_tier_id: "tier-123" }], error: null });
      }
      return builder;
    },
    in: () => {
      if (table === "pricing_tiers") {
        return Promise.resolve({
          data: [{ discount_bps: 800, min_order_cents: 30000 }],
          error: null,
        });
      }
      return Promise.resolve({ data: [], error: null });
    },
    order: () => builder,
    limit: () => builder,
    insert: (payload: unknown) => {
      calls.insert.push({ table, payload });
      if (table === "audit_logs") {
        return Promise.resolve({ error: null });
      }
      return builder;
    },
    maybeSingle: async () => {
      if (table === "b2b_accounts") {
        return { data: { approved: true }, error: null };
      }
      if (table === "inventory") {
        return {
          data: { on_hand: 10, allocated: 0, incoming: 0, safety_stock: 0, available: 10 },
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
            active: true,
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
      if (table === "payments") {
        return { data: { id: "payment-123" }, error: null };
      }
      return { data: null, error: null };
    },
  };

  return builder;
}
