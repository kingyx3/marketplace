import { describe, expect, it, vi } from "vitest";
import { configuredChannels, sendOrderConfirmationEmail } from "@/lib/notifications";

describe("order confirmation notifications", () => {
  it("records a skipped notification when Resend is not configured", async () => {
    const { supabase, calls } = fakeSupabase();
    const fetcher = vi.fn();

    const result = await sendOrderConfirmationEmail(supabase as never, "order-123", {
      env: { NEXT_PUBLIC_SITE_URL: "https://shop.example.test" },
      fetcher: fetcher as never,
    });

    expect(result).toEqual({
      ok: true,
      status: "skipped",
      notificationId: "notification-123",
    });
    expect(fetcher).not.toHaveBeenCalled();
    expect(calls.inserts[0]).toMatchObject({
      table: "notifications",
      row: {
        customer_id: "customer-123",
        channel: "email",
        template: "order_confirmation",
        status: "queued",
        provider: "resend",
        dedupe_key: "order_confirmation:order-123",
      },
    });
    expect(calls.updates).toContainEqual({
      table: "notifications",
      update: { status: "skipped", error: "email provider disabled" },
      filters: [["eq", "id", "notification-123"]],
    });
  });

  it("sends through Resend once and persists the provider message id", async () => {
    const { supabase, calls } = fakeSupabase();
    const fetcher = vi.fn(async () => Response.json({ id: "resend-message-123" }, { status: 200 }));

    const result = await sendOrderConfirmationEmail(supabase as never, "order-123", {
      env: {
        NEXT_PUBLIC_SITE_URL: "https://shop.example.test",
        RESEND_API_KEY: "re_test_123",
        RESEND_FROM_EMAIL: "orders@example.test",
      },
      fetcher: fetcher as never,
    });

    expect(result).toMatchObject({
      ok: true,
      status: "sent",
      notificationId: "notification-123",
      providerMessageId: "resend-message-123",
    });
    expect(fetcher).toHaveBeenCalledWith(
      "https://api.resend.com/emails",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer re_test_123",
          "Idempotency-Key": "order_confirmation:order-123",
        }),
      })
    );
    expect(calls.updates[0]).toMatchObject({
      table: "notifications",
      update: {
        status: "sent",
        provider_message_id: "resend-message-123",
      },
    });
  });

  it("does not resend when the notification dedupe key already exists", async () => {
    const { supabase } = fakeSupabase({
      notificationInsert: { data: null, error: { code: "23505", message: "duplicate key" } },
    });
    const fetcher = vi.fn();

    const result = await sendOrderConfirmationEmail(supabase as never, "order-123", {
      env: {
        RESEND_API_KEY: "re_test_123",
        RESEND_FROM_EMAIL: "orders@example.test",
      },
      fetcher: fetcher as never,
    });

    expect(result).toEqual({ ok: true, status: "duplicate" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("records provider failure without throwing", async () => {
    const { supabase, calls } = fakeSupabase();
    const fetcher = vi.fn(async () => Response.json({ message: "rate limited" }, { status: 429 }));

    const result = await sendOrderConfirmationEmail(supabase as never, "order-123", {
      env: {
        RESEND_API_KEY: "re_test_123",
        RESEND_FROM_EMAIL: "orders@example.test",
      },
      fetcher: fetcher as never,
    });

    expect(result).toMatchObject({
      ok: false,
      status: "failed",
      notificationId: "notification-123",
      error: "Resend error 429: rate limited",
    });
    expect(calls.updates).toContainEqual({
      table: "notifications",
      update: { status: "failed", error: "Resend error 429: rate limited" },
      filters: [["eq", "id", "notification-123"]],
    });
  });

  it("reports email as configured only when both Resend keys are present", () => {
    expect(configuredChannels({ RESEND_API_KEY: "re_test_123" })).not.toContain("email");
    expect(
      configuredChannels({
        RESEND_API_KEY: "re_test_123",
        RESEND_FROM_EMAIL: "orders@example.test",
      })
    ).toContain("email");
  });
});

function fakeSupabase(options: FakeSupabaseOptions = {}) {
  const calls: FakeCalls = { inserts: [], updates: [] };
  const supabase = {
    from: vi.fn((table: string) => tableBuilder(table, calls, options)),
  };
  return { supabase, calls };
}

function tableBuilder(table: string, calls: FakeCalls, options: FakeSupabaseOptions) {
  const filters: unknown[] = [];

  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn((column: string, value: unknown) => {
      filters.push(["eq", column, value]);
      return builder;
    }),
    maybeSingle: vi.fn(async () => {
      if (table === "orders") {
        return options.orderLookup ?? { data: paidOrder(), error: null };
      }
      return { data: null, error: null };
    }),
    insert: vi.fn((row: unknown) => {
      calls.inserts.push({ table, row });
      return {
        select: vi.fn(() => ({
          single: vi.fn(
            async () =>
              options.notificationInsert ??
              ({ data: { id: "notification-123" }, error: null } as FakeResponse)
          ),
        })),
      };
    }),
    update: vi.fn((update: unknown) => ({
      eq: vi.fn(async (column: string, value: unknown) => {
        calls.updates.push({ table, update, filters: [["eq", column, value]] });
        return options.notificationUpdate ?? { data: null, error: null };
      }),
    })),
  };

  return builder;
}

function paidOrder() {
  return {
    id: "order-123",
    customer_id: "customer-123",
    status: "paid",
    currency: "SGD",
    total_cents: 19900,
    placed_at: "2026-07-04T08:00:00.000Z",
    customers: {
      id: "customer-123",
      email: "buyer@example.test",
      name: "Buyer",
    },
    order_items: [
      {
        quantity: 1,
        unit_price_cents: 19900,
        booster_box_skus: {
          sku: "BOX-1",
          product_variants: {
            products: {
              name: "Sample Booster Box",
            },
          },
        },
      },
    ],
  };
}

interface FakeSupabaseOptions {
  orderLookup?: FakeResponse;
  notificationInsert?: FakeResponse;
  notificationUpdate?: FakeResponse;
}

interface FakeResponse {
  data: unknown;
  error: { code?: string; message: string } | null;
}

interface FakeCalls {
  inserts: Array<{ table: string; row: unknown }>;
  updates: Array<{ table: string; update: unknown; filters: unknown[] }>;
}
