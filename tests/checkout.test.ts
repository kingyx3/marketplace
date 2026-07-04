import { beforeEach, describe, expect, it, vi } from "vitest";
import { quoteCheckout, type CheckoutQuote } from "@/lib/commerce";
import {
  cancelPendingCheckoutPayment,
  checkoutResponseBody,
  createCheckoutPayment,
} from "@/lib/checkout";

vi.mock("@/lib/commerce", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/commerce")>();
  return {
    ...actual,
    quoteCheckout: vi.fn(),
  };
});

const mockedQuoteCheckout = vi.mocked(quoteCheckout);

const quote: CheckoutQuote = {
  mode: "order",
  channel: "b2c",
  currency: "SGD",
  lines: [
    {
      skuId: "11111111-1111-4111-8111-111111111111",
      sku: "BOX-1",
      productName: "Booster Box",
      quantity: 1,
      unitPriceCents: 19900,
      lineTotalCents: 19900,
      currency: "SGD",
      availableToSell: 3,
    },
  ],
  subtotalCents: 19900,
  discountBps: 0,
  discountCents: 0,
  totalCents: 19900,
  depositCents: 19900,
  balanceCents: 0,
};

describe("checkout PaymentIntent flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedQuoteCheckout.mockResolvedValue(quote);
  });

  it("creates a client-facing PaymentIntent response without trusting client totals", async () => {
    const { auth, supabase } = fakeAuthContext({
      rpcSingle: { data: { order_id: "order-123" }, error: null },
      paymentInsert: { data: { id: "payment-123" }, error: null },
    });
    const stripe = fakeStripe({
      createResult: { id: "pi_123", client_secret: "pi_123_secret_abc" },
    });

    const result = await createCheckoutPayment(
      auth as never,
      {
        mode: "order",
        channel: "b2c",
        items: [{ skuId: "11111111-1111-4111-8111-111111111111", quantity: 1 }],
      },
      stripe as never
    );

    expect(mockedQuoteCheckout).toHaveBeenCalledWith(
      supabase,
      expect.objectContaining({
        items: [{ skuId: "11111111-1111-4111-8111-111111111111", quantity: 1 }],
      }),
      auth.customer
    );
    expect(stripe.paymentIntents.create).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 19900,
        currency: "sgd",
        automatic_payment_methods: { enabled: true },
        metadata: expect.objectContaining({
          kind: "full",
          order_id: "order-123",
          customer_id: auth.customer.id,
        }),
      })
    );
    expect(checkoutResponseBody(result)).toEqual(
      expect.objectContaining({
        mode: "order",
        orderId: "order-123",
        paymentId: "payment-123",
        paymentIntentId: "pi_123",
        clientSecret: "pi_123_secret_abc",
        amountCents: 19900,
        currency: "SGD",
      })
    );
  });

  it("rolls back allocation when Stripe returns an unusable PaymentIntent", async () => {
    const { auth, calls } = fakeAuthContext({
      rpcSingle: { data: { order_id: "order-rollback" }, error: null },
      paymentInsert: { data: { id: "payment-rollback" }, error: null },
    });
    const stripe = fakeStripe({
      createResult: { id: "pi_without_secret" },
    });

    await expect(
      createCheckoutPayment(
        auth as never,
        {
          mode: "order",
          channel: "b2c",
          items: [{ skuId: "11111111-1111-4111-8111-111111111111", quantity: 1 }],
        },
        stripe as never
      )
    ).rejects.toThrow("Payment intent is missing a client secret");

    expect(stripe.paymentIntents.cancel).toHaveBeenCalledWith("pi_without_secret");
    expect(calls.rpc).toContainEqual({
      name: "release_order_allocation",
      params: { p_order_id: "order-rollback" },
    });
  });

  it("cancels a pending checkout attempt and releases the held allocation", async () => {
    const { auth, calls } = fakeAuthContext({
      paymentLookup: {
        data: {
          id: "payment-cancel",
          order_id: "order-cancel",
          preorder_id: null,
          status: "pending",
        },
        error: null,
      },
      orderLookup: { data: { id: "order-cancel", status: "pending_payment" }, error: null },
    });
    const stripe = fakeStripe();

    await expect(
      cancelPendingCheckoutPayment(auth as never, { paymentIntentId: "pi_cancel" }, stripe as never)
    ).resolves.toEqual({ cancelled: true, orderId: "order-cancel", preorderId: undefined });

    expect(stripe.paymentIntents.cancel).toHaveBeenCalledWith("pi_cancel");
    expect(calls.rpc).toContainEqual({
      name: "release_order_allocation",
      params: { p_order_id: "order-cancel" },
    });
    expect(calls.updates).toContainEqual({
      table: "payments",
      update: { status: "cancelled" },
      filters: [["eq", "id", "payment-cancel"]],
      inFilters: [["in", "status", ["pending", "requires_capture", "authorized"]]],
    });
  });
});

function fakeAuthContext(options: FakeSupabaseOptions = {}) {
  const { supabase, calls } = fakeSupabase(options);
  return {
    auth: {
      supabase,
      user: { id: "auth-user-123", email: "buyer@example.com" },
      roles: [],
      isAdmin: false,
      customer: {
        id: "customer-123",
        auth_user_id: "auth-user-123",
        email: "buyer@example.com",
        name: "Buyer",
        phone: null,
        segment: "player",
        default_currency: "SGD",
        marketing_opt_in: false,
      },
    },
    supabase,
    calls,
  };
}

interface FakeSupabaseOptions {
  rpcSingle?: { data: unknown; error: { message: string } | null };
  paymentInsert?: { data: unknown; error: { message: string } | null };
  paymentLookup?: { data: unknown; error: { message: string } | null };
  orderLookup?: { data: unknown; error: { message: string } | null };
  preorderLookup?: { data: unknown; error: { message: string } | null };
}

function fakeSupabase(options: FakeSupabaseOptions) {
  const calls: FakeCalls = { rpc: [], inserts: [], updates: [] };

  const supabase = {
    rpc: vi.fn((name: string, params: unknown) => {
      calls.rpc.push({ name, params });
      if (name === "create_checkout_order_from_cart") {
        return {
          single: vi.fn(async () => options.rpcSingle ?? { data: null, error: null }),
        };
      }
      return Promise.resolve({ data: null, error: null });
    }),
    from: vi.fn((table: string) => tableBuilder(table, calls, options)),
  };

  return { supabase: supabase as never, calls };
}

function tableBuilder(table: string, calls: FakeCalls, options: FakeSupabaseOptions) {
  const filters: unknown[] = [];
  const inFilters: unknown[] = [];
  let updatePayload: unknown;

  const builder = {
    select: vi.fn(() => builder),
    insert: vi.fn((row: unknown) => {
      calls.inserts.push({ table, row });
      return builder;
    }),
    update: vi.fn((row: unknown) => {
      updatePayload = row;
      return builder;
    }),
    eq: vi.fn((key: string, value: unknown) => {
      filters.push(["eq", key, value]);
      return builder;
    }),
    in: vi.fn(async (key: string, values: unknown[]) => {
      inFilters.push(["in", key, values]);
      calls.updates.push({ table, update: updatePayload, filters: [...filters], inFilters });
      return { data: null, error: null };
    }),
    maybeSingle: vi.fn(async () => {
      if (table === "payments") return options.paymentLookup ?? { data: null, error: null };
      if (table === "orders") return options.orderLookup ?? { data: null, error: null };
      if (table === "preorders") return options.preorderLookup ?? { data: null, error: null };
      return { data: null, error: null };
    }),
    single: vi.fn(async () => {
      if (table === "payments") return options.paymentInsert ?? { data: null, error: null };
      return { data: null, error: null };
    }),
  };

  return builder;
}

interface FakeCalls {
  rpc: Array<{ name: string; params: unknown }>;
  inserts: Array<{ table: string; row: unknown }>;
  updates: Array<{
    table: string;
    update: unknown;
    filters: unknown[];
    inFilters: unknown[];
  }>;
}

function fakeStripe(options: { createResult?: unknown } = {}) {
  return {
    paymentIntents: {
      create: vi.fn(
        async () => options.createResult ?? { id: "pi_default", client_secret: "secret" }
      ),
      cancel: vi.fn(async () => ({ id: "pi_cancelled", status: "canceled" })),
    },
  };
}
