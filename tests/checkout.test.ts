import { beforeEach, describe, expect, it, vi } from "vitest";

import { quoteCheckout, type CheckoutQuote } from "@/lib/commerce";
import { cancelPendingCheckoutPayment } from "@/lib/checkout";
import {
  checkoutResponseBody,
  createCheckoutPayment,
} from "@/lib/order-checkout";
import { HitPayRequestError } from "@/lib/hitpay";

vi.mock("@/lib/commerce", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/commerce")>();
  return {
    ...actual,
    quoteCheckout: vi.fn(),
  };
});

const mockedQuoteCheckout = vi.mocked(quoteCheckout);
const requestId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const shippingAddress = {
  recipientName: "Buyer",
  line1: "1 Market Street",
  city: "Singapore",
  postalCode: "048940",
  countryCode: "SG",
};

const quote: CheckoutQuote = {
  mode: "order",
  channel: "b2c",
  currency: "SGD",
  lines: [
    {
      productId: "11111111-1111-4111-8111-111111111111",
      referenceCode: "BOX-1",
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
  shippingCents: 800,
  shippingService: "Tracked delivery",
  shippingPolicyKey: "shipping_policy",
  taxCents: 1709,
  totalCents: 20700,
  depositCents: 20700,
  balanceCents: 0,
};

describe("hosted HitPay checkout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedQuoteCheckout.mockResolvedValue(quote);
  });

  it("creates a shipping-aware HitPay payment request with a stock deadline", async () => {
    const reservationExpiresAt = "2026-07-18T07:15:00.000Z";
    const { auth, supabase, calls } = fakeAuthContext({
      rpcSingle: {
        data: {
          order_id: "order-123",
          reservation_expires_at: reservationExpiresAt,
        },
        error: null,
      },
      paymentAttemptInsert: {
        data: { id: "attempt-123", idempotency_key: "attempt-key-123" },
        error: null,
      },
      paymentInsert: { data: { id: "payment-123" }, error: null },
    });
    const hitpay = fakeHitPay();

    const result = await createCheckoutPayment(
      auth as never,
      {
        mode: "order",
        channel: "b2c",
        shippingAddress,
        items: [
          { productId: "11111111-1111-4111-8111-111111111111", quantity: 1 },
        ],
      },
      hitpay as never,
    );

    expect(mockedQuoteCheckout).toHaveBeenCalledWith(
      supabase,
      expect.objectContaining({
        shippingAddress,
        items: [
          { productId: "11111111-1111-4111-8111-111111111111", quantity: 1 },
        ],
      }),
      auth.customer,
    );
    expect(hitpay.createPaymentRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        amountCents: 20700,
        currency: "SGD",
        email: "buyer@example.com",
        name: "Buyer",
        purpose: "Marketplace order order-123",
        referenceNumber: "attempt:attempt-123",
        expiresAfter: "15 minutes",
      }),
    );
    expect(calls.inserts).toContainEqual({
      table: "payment_attempts",
      row: expect.objectContaining({
        order_id: "order-123",
        provider: "hitpay",
        amount_cents: 20700,
        status: "calling_provider",
      }),
    });
    expect(calls.inserts).toContainEqual({
      table: "payments",
      row: expect.objectContaining({
        order_id: "order-123",
        provider: "hitpay",
        provider_payment_id: requestId,
        amount_cents: 20700,
        status: "pending",
      }),
    });
    expect(checkoutResponseBody(result)).toEqual(
      expect.objectContaining({
        mode: "order",
        orderId: "order-123",
        paymentId: "payment-123",
        paymentRequestId: requestId,
        checkoutUrl: "https://securecheckout.sandbox.hit-pay.com/example",
        amountCents: 20700,
        currency: "SGD",
        reservationExpiresAt,
        quote: expect.objectContaining({
          shippingCents: 800,
          totalCents: 20700,
        }),
      }),
    );
  });

  it("returns actionable stock conflict feedback before HitPay is called", async () => {
    const { auth } = fakeAuthContext({
      rpcSingle: {
        data: null,
        error: { message: "insufficient inventory for referenceCode" },
      },
    });
    const hitpay = fakeHitPay();

    await expect(
      createCheckoutPayment(
        auth as never,
        {
          mode: "order",
          channel: "b2c",
          shippingAddress,
          items: [
            { productId: "11111111-1111-4111-8111-111111111111", quantity: 1 },
          ],
        },
        hitpay as never,
      ),
    ).rejects.toThrow("currently reserved by another checkout or has sold out");

    expect(hitpay.createPaymentRequest).not.toHaveBeenCalled();
  });

  it("releases allocation when HitPay payment-request creation fails", async () => {
    const { auth, calls } = fakeAuthContext({
      rpcSingle: { data: { order_id: "order-rollback" }, error: null },
    });
    const hitpay = fakeHitPay({ createError: new Error("HitPay unavailable") });

    await expect(
      createCheckoutPayment(
        auth as never,
        {
          mode: "order",
          channel: "b2c",
          shippingAddress,
          items: [
            { productId: "11111111-1111-4111-8111-111111111111", quantity: 1 },
          ],
        },
        hitpay as never,
      ),
    ).rejects.toThrow("HitPay unavailable");

    expect(calls.rpc).toContainEqual({
      name: "release_order_allocation",
      params: { p_order_id: "order-rollback" },
    });
  });

  it("preserves the reservation when the provider result is unknown", async () => {
    const { auth, calls } = fakeAuthContext({
      rpcSingle: { data: { order_id: "order-unknown" }, error: null },
    });
    const hitpay = fakeHitPay({
      createError: new HitPayRequestError("HitPay request outcome is unknown", {
        outcomeUnknown: true,
      }),
    });

    await expect(
      createCheckoutPayment(
        auth as never,
        {
          mode: "order",
          channel: "b2c",
          shippingAddress,
          items: [
            { productId: "11111111-1111-4111-8111-111111111111", quantity: 1 },
          ],
        },
        hitpay as never,
      ),
    ).rejects.toMatchObject({ code: "external_result_unknown" });

    expect(calls.rpc).not.toContainEqual({
      name: "release_order_allocation",
      params: { p_order_id: "order-unknown" },
    });
  });

  it("cancels a pending checkout and releases the held allocation", async () => {
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
      orderLookup: {
        data: { id: "order-cancel", status: "pending_payment" },
        error: null,
      },
    });
    const hitpay = fakeHitPay();

    await expect(
      cancelPendingCheckoutPayment(
        auth as never,
        { paymentRequestId: requestId },
        hitpay as never,
      ),
    ).resolves.toEqual({
      cancelled: true,
      orderId: "order-cancel",
      preorderId: undefined,
    });

    expect(hitpay.cancelPaymentRequest).toHaveBeenCalledWith(requestId);
    expect(calls.rpc).toContainEqual({
      name: "release_order_allocation",
      params: { p_order_id: "order-cancel" },
    });
    expect(calls.updates).toContainEqual({
      table: "payments",
      update: { status: "cancelled" },
      filters: [["eq", "id", "payment-cancel"]],
      inFilters: [
        ["in", "status", ["pending", "requires_capture", "authorized"]],
      ],
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
  paymentAttemptInsert?: { data: unknown; error: { message: string } | null };
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
          single: vi.fn(
            async () => options.rpcSingle ?? { data: null, error: null },
          ),
        };
      }
      return Promise.resolve({ data: null, error: null });
    }),
    from: vi.fn((table: string) => tableBuilder(table, calls, options)),
  };
  return { supabase: supabase as never, calls };
}

function tableBuilder(
  table: string,
  calls: FakeCalls,
  options: FakeSupabaseOptions,
) {
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
      calls.updates.push({
        table,
        update: updatePayload,
        filters: [...filters],
        inFilters,
      });
      return { data: null, error: null };
    }),
    maybeSingle: vi.fn(async () => {
      if (table === "payments")
        return options.paymentLookup ?? { data: null, error: null };
      if (table === "orders")
        return options.orderLookup ?? { data: null, error: null };
      if (table === "preorders")
        return options.preorderLookup ?? { data: null, error: null };
      return { data: null, error: null };
    }),
    single: vi.fn(async () => {
      if (table === "payment_attempts") {
        return (
          options.paymentAttemptInsert ?? {
            data: {
              id: "attempt-default",
              idempotency_key: "attempt-key-default",
            },
            error: null,
          }
        );
      }
      if (table === "payments")
        return options.paymentInsert ?? { data: null, error: null };
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

function fakeHitPay(options: { createError?: Error } = {}) {
  return {
    createPaymentRequest: vi.fn(async () => {
      if (options.createError) throw options.createError;
      return {
        id: requestId,
        status: "pending",
        amount: "207.00",
        currency: "SGD",
        url: "https://securecheckout.sandbox.hit-pay.com/example",
      };
    }),
    getPaymentRequest: vi.fn(),
    cancelPaymentRequest: vi.fn(async () => undefined),
    createRefund: vi.fn(),
  };
}
