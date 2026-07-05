import { readFile } from "node:fs/promises";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPreorderBalancePayment } from "@/lib/checkout";
import { runPreorderAllocationForSku } from "@/lib/preorders";
import { handleStripeEvent } from "@/lib/stripe-webhooks";
import { sendOrderConfirmationEmail } from "@/lib/notifications";

vi.mock("@/lib/notifications", () => ({
  sendOrderConfirmationEmail: vi.fn(async () => ({ ok: true, status: "sent" })),
}));

const mockedSendOrderConfirmationEmail = vi.mocked(sendOrderConfirmationEmail);

describe("preorder allocation, balance, and conversion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("runs live allocation against outstanding preorder quantities only", async () => {
    const { supabase, calls } = fakeAllocationSupabase({
      inventory: { on_hand: 0, incoming: 10, allocated: 2, safety_stock: 0 },
      rules: [
        { priority: 10, channel: "b2c", reserve_quantity: 2, max_per_customer: 1 },
        { priority: 20, channel: "b2b", reserve_quantity: 0, max_per_customer: null },
      ],
      preorders: [
        preorder("pre-c1", "customer-1", "b2c", 2, 0, 1),
        preorder("pre-c2", "customer-2", "b2c", 2, 0, 2),
        preorder("pre-b1", "customer-3", "b2b", 10, 0, 3),
      ],
      rpcData: [
        { preorder_id: "pre-c1", allocated_qty: 1, balance_cents: 15920, status: "balance_due" },
        { preorder_id: "pre-c2", allocated_qty: 1, balance_cents: 15920, status: "balance_due" },
        { preorder_id: "pre-b1", allocated_qty: 6, balance_cents: 95520, status: "balance_due" },
      ],
    });

    const result = await runPreorderAllocationForSku(
      supabase as never,
      "11111111-1111-4111-8111-111111111111",
      "admin:auth-user"
    );

    expect(result).toHaveLength(3);
    expect(calls.rpc).toContainEqual({
      name: "apply_preorder_allocations",
      params: {
        p_sku_id: "11111111-1111-4111-8111-111111111111",
        p_actor: "admin:auth-user",
        p_allocations: [
          { preorder_id: "pre-c1", allocated: 1 },
          { preorder_id: "pre-c2", allocated: 1 },
          { preorder_id: "pre-b1", allocated: 6 },
        ],
      },
    });
  });

  it("does not reapply allocation for already-filled preorders", async () => {
    const { supabase, calls } = fakeAllocationSupabase({
      inventory: { on_hand: 0, incoming: 10, allocated: 2, safety_stock: 0 },
      rules: [{ priority: 10, channel: "b2c", reserve_quantity: 0, max_per_customer: null }],
      preorders: [preorder("pre-filled", "customer-1", "b2c", 2, 2, 1)],
      rpcData: [],
    });

    await expect(
      runPreorderAllocationForSku(
        supabase as never,
        "11111111-1111-4111-8111-111111111111",
        "admin:auth-user"
      )
    ).resolves.toEqual([]);
    expect(calls.rpc).toEqual([]);
  });

  it("creates a balance PaymentIntent from server-side preorder state", async () => {
    const { auth, calls } = fakeBalanceAuth();
    const stripe = fakeStripe();

    const result = await createPreorderBalancePayment(
      auth as never,
      "22222222-2222-4222-8222-222222222222",
      stripe as never
    );

    expect(stripe.paymentIntents.create).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 16000,
        currency: "sgd",
        automatic_payment_methods: { enabled: true },
        metadata: expect.objectContaining({
          kind: "balance",
          preorder_id: "22222222-2222-4222-8222-222222222222",
          customer_id: "customer-123",
        }),
      })
    );
    expect(calls.inserts).toContainEqual({
      table: "payments",
      row: expect.objectContaining({
        preorder_id: "22222222-2222-4222-8222-222222222222",
        kind: "balance",
        amount_cents: 16000,
        status: "pending",
      }),
    });
    expect(result).toMatchObject({
      mode: "preorder",
      preorderId: "22222222-2222-4222-8222-222222222222",
      amountCents: 16000,
      paymentIntentId: "pi_balance",
    });
  });

  it("rejects a balance amount that exceeds the remaining allocated balance", async () => {
    const { auth } = fakeBalanceAuth({
      preorder: {
        ...balancePreorder(),
        balance_cents: 20000,
      },
    });

    await expect(
      createPreorderBalancePayment(
        auth as never,
        "22222222-2222-4222-8222-222222222222",
        fakeStripe() as never
      )
    ).rejects.toThrow("Pre-order balance is invalid");
  });

  it("converts a balance-paid preorder and sends the resulting order confirmation", async () => {
    const { supabase, calls } = fakeWebhookSupabase();

    await handleStripeEvent(
      supabase as never,
      {
        id: "evt_balance",
        type: "payment_intent.succeeded",
        data: {
          object: {
            id: "pi_balance",
            amount: 16000,
            amount_received: 16000,
            currency: "sgd",
          },
        },
      } as never
    );

    expect(calls.rpc).toContainEqual({
      name: "mark_preorder_balance_paid",
      params: {
        p_preorder_id: "22222222-2222-4222-8222-222222222222",
        p_provider_payment_id: "pi_balance",
        p_amount_cents: 16000,
        p_currency: "sgd",
      },
    });
    expect(mockedSendOrderConfirmationEmail).toHaveBeenCalledWith(
      supabase,
      "33333333-3333-4333-8333-333333333333"
    );
  });

  it("keeps the SQL state machine guarded", async () => {
    const migration = await readFile(
      new URL(
        "../supabase/migrations/20260704161645_preorder_allocation_balance_conversion.sql",
        import.meta.url
      ),
      "utf8"
    );

    expect(migration).toContain("create or replace function public.apply_preorder_allocations");
    expect(migration).toContain("i.allocated + v_total_delta <= i.on_hand + i.incoming");
    expect(migration).toContain("create or replace function public.mark_preorder_balance_paid");
    expect(migration).toContain("payment amount exceeds remaining balance");
    expect(migration).toContain("PREORDER_BALANCE_PAID_CONVERTED");
  });
});

function preorder(
  id: string,
  customerId: string,
  channel: "b2c" | "b2b",
  quantity: number,
  allocatedQty: number,
  position: number
) {
  return {
    id,
    customer_id: customerId,
    channel,
    quantity,
    allocated_qty: allocatedQty,
    created_at: `2026-07-04T00:00:0${position}.000Z`,
  };
}

function fakeAllocationSupabase(options: {
  inventory: unknown;
  rules: unknown[];
  preorders: unknown[];
  rpcData: unknown[];
}) {
  const calls: { rpc: Array<{ name: string; params: unknown }> } = { rpc: [] };
  const supabase = {
    from: vi.fn((table: string) => allocationTable(table, options)),
    rpc: vi.fn(async (name: string, params: unknown) => {
      calls.rpc.push({ name, params });
      return { data: options.rpcData, error: null };
    }),
  };
  return { supabase, calls };
}

function allocationTable(
  table: string,
  options: { inventory: unknown; rules: unknown[]; preorders: unknown[] }
) {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    in: vi.fn(() => builder),
    maybeSingle: vi.fn(async () => ({ data: options.inventory, error: null })),
    order: vi.fn(async () => {
      if (table === "allocation_rules") return { data: options.rules, error: null };
      if (table === "preorders") return { data: options.preorders, error: null };
      return { data: [], error: null };
    }),
  };
  return builder;
}

function fakeBalanceAuth(options: { preorder?: unknown; openPayments?: unknown[] } = {}) {
  const calls: { inserts: Array<{ table: string; row: unknown }> } = { inserts: [] };
  const supabase = {
    from: vi.fn((table: string) => balanceTable(table, calls, options)),
  };
  return {
    auth: {
      supabase,
      user: { id: "auth-user-123" },
      customer: {
        id: "customer-123",
        email: "buyer@example.test",
        default_currency: "SGD",
      },
    },
    calls,
  };
}

function balanceTable(
  table: string,
  calls: { inserts: Array<{ table: string; row: unknown }> },
  options: { preorder?: unknown; openPayments?: unknown[] }
) {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    in: vi.fn(() => builder),
    limit: vi.fn(async () => ({ data: options.openPayments ?? [], error: null })),
    maybeSingle: vi.fn(async () => {
      if (table === "preorders") {
        return { data: options.preorder ?? balancePreorder(), error: null };
      }
      return { data: null, error: null };
    }),
    insert: vi.fn((row: unknown) => {
      calls.inserts.push({ table, row });
      return {
        select: vi.fn(() => ({
          single: vi.fn(async () => ({ data: { id: "payment-balance" }, error: null })),
        })),
      };
    }),
  };
  return builder;
}

function balancePreorder() {
  return {
    id: "22222222-2222-4222-8222-222222222222",
    customer_id: "customer-123",
    sku_id: "11111111-1111-4111-8111-111111111111",
    channel: "b2c",
    quantity: 1,
    unit_price_cents: 19900,
    deposit_cents: 3900,
    balance_cents: 16000,
    currency: "SGD",
    status: "balance_due",
    allocated_qty: 1,
    booster_box_skus: {
      sku: "BOX-1",
      product_variants: { products: { name: "Sample Booster Box" } },
    },
  };
}

function fakeStripe() {
  return {
    paymentIntents: {
      create: vi.fn(async () => ({
        id: "pi_balance",
        client_secret: "pi_balance_secret",
      })),
      cancel: vi.fn(),
    },
  };
}

function fakeWebhookSupabase() {
  const calls: { rpc: Array<{ name: string; params: unknown }> } = { rpc: [] };
  const supabase = {
    from: vi.fn((table: string) => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => {
              if (table === "payments") {
                return {
                  data: {
                    id: "payment-balance",
                    preorder_id: "22222222-2222-4222-8222-222222222222",
                    order_id: null,
                    kind: "balance",
                    status: "pending",
                    currency: "SGD",
                  },
                  error: null,
                };
              }
              return { data: null, error: null };
            }),
          })),
        })),
      })),
    })),
    rpc: vi.fn(async (name: string, params: unknown) => {
      calls.rpc.push({ name, params });
      return { data: "33333333-3333-4333-8333-333333333333", error: null };
    }),
  };
  return { supabase, calls };
}
