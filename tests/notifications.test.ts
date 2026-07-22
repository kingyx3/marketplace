import { describe, expect, it, vi } from "vitest";
import { configuredChannels, providers, sendOrderConfirmationEmail } from "@/lib/notifications";

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
    const fetcher = vi.fn(async (...args: Parameters<typeof fetch>) => {
      void args;
      return Response.json({ id: "resend-message-123" }, { status: 200 });
    });

    const result = await sendOrderConfirmationEmail(supabase as never, "order-123", {
      env: {
        APP_NAME: "Card Vault",
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
    const [, requestInit] = fetcher.mock.calls[0] as [RequestInfo | URL, RequestInit];
    const body = JSON.parse(String(requestInit.body));
    expect(body.subject).toContain("Card Vault order confirmation");
    expect(body.text).toContain("Your Card Vault order is confirmed.");
    expect(body.html).toContain("Card Vault has received your payment");
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

  it("sends Telegram messages through the Bot API", async () => {
    const fetcher = vi.fn(async (...args: Parameters<typeof fetch>) => {
      void args;
      return Response.json({ ok: true, result: { message_id: 42 } }, { status: 200 });
    });

    const result = await providers.telegram.send(
      {
        channel: "telegram",
        customerId: "customer-123",
        to: "123456789",
        template: "drop_alert",
        payload: {},
        text: "Drop is live",
      },
      {
        env: { TELEGRAM_BOT_TOKEN: "telegram-token" },
        fetcher: fetcher as never,
      }
    );

    expect(result).toEqual({ ok: true, providerMessageId: "42" });
    expect(fetcher).toHaveBeenCalledWith(
      "https://api.telegram.org/bottelegram-token/sendMessage",
      expect.objectContaining({ method: "POST" })
    );
    const [, requestInit] = fetcher.mock.calls[0] as [RequestInfo | URL, RequestInit];
    expect(JSON.parse(String(requestInit.body))).toMatchObject({
      chat_id: "123456789",
      text: "Drop is live",
      disable_web_page_preview: true,
    });
  });

  it("sends WhatsApp messages through the Cloud API", async () => {
    const fetcher = vi.fn(async (...args: Parameters<typeof fetch>) => {
      void args;
      return Response.json({ messages: [{ id: "wamid.123" }] }, { status: 200 });
    });

    const result = await providers.whatsapp.send(
      {
        channel: "whatsapp",
        customerId: "customer-123",
        to: "6591234567",
        template: "drop_alert",
        payload: {},
        text: "Drop is live",
      },
      {
        env: {
          WHATSAPP_ACCESS_TOKEN: "whatsapp-token",
          WHATSAPP_PHONE_NUMBER_ID: "phone-number-id",
        },
        fetcher: fetcher as never,
      }
    );

    expect(result).toEqual({ ok: true, providerMessageId: "wamid.123" });
    expect(fetcher).toHaveBeenCalledWith(
      "https://graph.facebook.com/v20.0/phone-number-id/messages",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer whatsapp-token" }),
      })
    );
    const [, requestInit] = fetcher.mock.calls[0] as [RequestInfo | URL, RequestInit];
    expect(JSON.parse(String(requestInit.body))).toMatchObject({
      messaging_product: "whatsapp",
      to: "6591234567",
      type: "text",
      text: { body: "Drop is live" },
    });
  });

  it("reports Telegram and WhatsApp as configured only with complete provider keys", () => {
    expect(configuredChannels({ TELEGRAM_BOT_TOKEN: "telegram-token" })).toContain("telegram");
    expect(configuredChannels({ WHATSAPP_ACCESS_TOKEN: "whatsapp-token" })).not.toContain(
      "whatsapp"
    );
    expect(
      configuredChannels({
        WHATSAPP_ACCESS_TOKEN: "whatsapp-token",
        WHATSAPP_PHONE_NUMBER_ID: "phone-number-id",
      })
    ).toContain("whatsapp");
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
        products: {
          referenceCode: "BOX-1",
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
