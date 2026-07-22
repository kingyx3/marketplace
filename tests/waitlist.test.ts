import { describe, expect, it, vi } from "vitest";
import { joinWaitlist, normalizeWaitlistContact, notifyDropForProduct } from "@/lib/waitlist";

const PRODUCT_ID = "00000000-0000-4000-8000-000000000001";
const CUSTOMER_ID = "00000000-0000-4000-8000-000000000002";

describe("waitlist restock alerts", () => {
  it("normalizes channel-specific contacts", () => {
    expect(normalizeWaitlistContact("email", undefined, "Buyer@Example.Test")).toBe(
      "buyer@example.test"
    );
    expect(normalizeWaitlistContact("telegram", " 123456789 ", "buyer@example.test")).toBe(
      "123456789"
    );
    expect(normalizeWaitlistContact("whatsapp", "+65 9123 4567", "buyer@example.test")).toBe(
      "6591234567"
    );
    expect(() => normalizeWaitlistContact("whatsapp", "123", "buyer@example.test")).toThrow(
      "WhatsApp number must include a country code"
    );
  });

  it("joins a customer to a Product waitlist with server-normalized contact", async () => {
    const { supabase, calls } = fakeSupabase();

    const entry = await joinWaitlist(supabase as never, customer(), {
      productId: PRODUCT_ID,
      channel: "whatsapp",
      contact: "+65 9123 4567",
    });

    expect(entry).toMatchObject({
      id: "waitlist-1",
      productId: PRODUCT_ID,
      referenceCode: "BOX-1",
      productName: "Sample Booster Box",
      productSlug: "sample-booster-box",
      channel: "whatsapp",
      contact: "6591234567",
      status: "active",
      createdAt: "2026-07-05T00:00:00.000Z",
      updatedAt: "2026-07-05T00:00:00.000Z",
      notifiedAt: null,
    });
    expect(calls.upserts[0]).toMatchObject({
      table: "waitlist_entries",
      options: { onConflict: "customer_id,product_id,channel" },
      row: {
        customer_id: CUSTOMER_ID,
        product_id: PRODUCT_ID,
        channel: "whatsapp",
        contact: "6591234567",
        status: "active",
        notified_at: null,
      },
    });
  });

  it("claims, sends, and marks active drop notifications as notified", async () => {
    const { supabase, calls } = fakeSupabase();
    const fetcher = vi.fn(async (...args: Parameters<typeof fetch>) => {
      void args;
      return Response.json({ ok: true, result: { message_id: 42 } }, { status: 200 });
    });

    const results = await notifyDropForProduct(supabase as never, PRODUCT_ID, {
      env: {
        APP_NAME: "Card Vault",
        NEXT_PUBLIC_SITE_URL: "https://shop.example.test",
        TELEGRAM_BOT_TOKEN: "telegram-token",
      },
      fetcher: fetcher as never,
    });

    expect(results).toEqual([
      {
        waitlistEntryId: "waitlist-1",
        channel: "telegram",
        status: "sent",
        notificationId: "notification-1",
        providerMessageId: "42",
      },
    ]);
    expect(calls.inserts[0]).toMatchObject({
      table: "notifications",
      row: {
        customer_id: CUSTOMER_ID,
        channel: "telegram",
        template: "drop_alert",
        status: "queued",
        provider: "telegram",
        dedupe_key: "drop_alert:waitlist-1:2026-07-05T00:00:00.000Z",
      },
    });
    expect(fetcher).toHaveBeenCalledWith(
      "https://api.telegram.org/bottelegram-token/sendMessage",
      expect.objectContaining({ method: "POST" })
    );
    const [, requestInit] = fetcher.mock.calls[0] as [RequestInfo | URL, RequestInit];
    const message = JSON.parse(String(requestInit.body));
    expect(message.text).toContain("Card Vault restock alert");
    expect(message.text).not.toContain("Product:");
    expect(calls.updates).toContainEqual({
      table: "notifications",
      update: {
        status: "sent",
        provider_message_id: "42",
        sent_at: expect.any(String),
      },
      filters: [["eq", "id", "notification-1"]],
    });
    expect(calls.updates).toContainEqual({
      table: "waitlist_entries",
      update: { status: "notified", notified_at: expect.any(String) },
      filters: [["eq", "id", "waitlist-1"]],
    });
  });
});

function fakeSupabase() {
  const calls: FakeCalls = { inserts: [], updates: [], upserts: [] };
  const supabase = {
    from: vi.fn((table: string) => tableBuilder(table, calls)),
  };
  return { supabase, calls };
}

function tableBuilder(table: string, calls: FakeCalls) {
  const filters: unknown[] = [];

  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn((column: string, value: unknown) => {
      filters.push(["eq", column, value]);
      return builder;
    }),
    order: vi.fn(() => builder),
    limit: vi.fn(async () => {
      if (table === "waitlist_entries") {
        return { data: [dropWaitlistRow()], error: null };
      }
      return { data: [], error: null };
    }),
    maybeSingle: vi.fn(async () => {
      if (table === "products") {
        return { data: productRow(), error: null };
      }
      return { data: null, error: null };
    }),
    upsert: vi.fn((row: unknown, options: unknown) => {
      calls.upserts.push({ table, row, options });
      return {
        select: vi.fn(() => ({
          single: vi.fn(async () => ({ data: waitlistRow(), error: null })),
        })),
      };
    }),
    insert: vi.fn((row: unknown) => {
      calls.inserts.push({ table, row });
      return {
        select: vi.fn(() => ({
          single: vi.fn(async () => ({ data: { id: "notification-1" }, error: null })),
        })),
      };
    }),
    update: vi.fn((update: unknown) => ({
      eq: vi.fn(async (column: string, value: unknown) => {
        calls.updates.push({ table, update, filters: [["eq", column, value]] });
        return { data: null, error: null };
      }),
    })),
  };

  return builder;
}

function customer() {
  return {
    id: CUSTOMER_ID,
    auth_user_id: "auth-user-1",
    email: "buyer@example.test",
    name: "Buyer",
    phone: null,
    segment: "player",
    default_currency: "SGD",
    marketing_opt_in: false,
  };
}

function productRow() {
  return {
    id: PRODUCT_ID,
    reference_code: "BOX-1",
    name: "Sample Booster Box",
    slug: "sample-booster-box",
    active: true,
    product_inventory: [{ available: 3, incoming: 0 }],
  };
}

function waitlistRow() {
  return {
    id: "waitlist-1",
    product_id: PRODUCT_ID,
    channel: "whatsapp",
    contact: "6591234567",
    status: "active",
    created_at: "2026-07-05T00:00:00.000Z",
    updated_at: "2026-07-05T00:00:00.000Z",
    notified_at: null,
    products: {
      reference_code: "BOX-1",
      name: "Sample Booster Box",
      slug: "sample-booster-box",
    },
  };
}

function dropWaitlistRow() {
  return {
    id: "waitlist-1",
    customer_id: CUSTOMER_ID,
    product_id: PRODUCT_ID,
    channel: "telegram",
    contact: "123456789",
    status: "active",
    updated_at: "2026-07-05T00:00:00.000Z",
  };
}

interface FakeCalls {
  inserts: Array<{ table: string; row: unknown }>;
  updates: Array<{ table: string; update: unknown; filters: unknown[] }>;
  upserts: Array<{ table: string; row: unknown; options: unknown }>;
}
