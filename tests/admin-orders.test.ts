import { readFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import { adminOrderActionFromForm } from "@/lib/admin-order-forms";
import {
  adminOrderActionSchema,
  buildAdminOrderExceptionQueue,
  performAdminOrderAction,
} from "@/lib/orders";

describe("admin order actions", () => {
  it("rejects arbitrary direct paid status updates", () => {
    expect(() => adminOrderActionSchema.parse({ status: "paid" })).toThrow();
    expect(() =>
      adminOrderActionSchema.parse({ action: "record_manual_reconciliation" })
    ).toThrow();
  });

  it("routes manual reconciliation through the audited database function", async () => {
    const { supabase, calls } = fakeSupabase();

    await performAdminOrderAction(
      supabase as never,
      "11111111-1111-4111-8111-111111111111",
      {
        action: "record_manual_reconciliation",
        provider: "hitpay",
        providerPaymentId: "pi_manual_123",
        amountCents: 19900,
        currency: "sgd",
        reason: "operator matched HitPay dashboard payment",
      },
      "admin:auth-user"
    );

    expect(calls.rpc).toContainEqual({
      name: "admin_record_manual_reconciliation",
      params: {
        p_order_id: "11111111-1111-4111-8111-111111111111",
        p_provider: "hitpay",
        p_provider_payment_id: "pi_manual_123",
        p_amount_cents: 19900,
        p_currency: "SGD",
        p_reason: "operator matched HitPay dashboard payment",
        p_actor: "admin:auth-user",
      },
    });
  });

  it("routes cancellation through the audited allocation-release function", async () => {
    const { supabase, calls } = fakeSupabase();

    await performAdminOrderAction(
      supabase as never,
      "11111111-1111-4111-8111-111111111111",
      {
        action: "cancel_unpaid",
        reason: "customer asked to cancel before payment",
      },
      "admin:auth-user"
    );

    expect(calls.rpc).toContainEqual({
      name: "admin_cancel_unpaid_order",
      params: {
        p_order_id: "11111111-1111-4111-8111-111111111111",
        p_reason: "customer asked to cancel before payment",
        p_actor: "admin:auth-user",
      },
    });
  });

  it("identifies manual, stale, failed-allocation, and orphan-provider exceptions", () => {
    const exceptions = buildAdminOrderExceptionQueue({
      now: new Date("2026-07-04T12:00:00.000Z"),
      manualExceptions: [
        {
          id: "manual-1",
          order_id: "order-1",
          payment_id: null,
          exception_type: "manual_flag",
          severity: "warning",
          detail: "Operator flagged mismatch",
          created_at: "2026-07-04T10:00:00.000Z",
        },
      ],
      payments: [
        {
          id: "payment-stale",
          order_id: "order-stale",
          preorder_id: null,
          provider_payment_id: "pi_stale",
          status: "pending",
          created_at: "2026-07-03T00:00:00.000Z",
          orders: {
            id: "order-stale",
            status: "pending_payment",
            total_cents: 19900,
            currency: "SGD",
          },
        },
        {
          id: "payment-failed",
          order_id: "order-failed",
          preorder_id: null,
          provider_payment_id: "pi_failed",
          status: "failed",
          created_at: "2026-07-04T08:00:00.000Z",
          orders: {
            id: "order-failed",
            status: "pending_payment",
            total_cents: 19900,
            currency: "SGD",
          },
        },
      ],
      webhookEvents: [
        {
          id: "event-1",
          event_id: "evt_1",
          event_type: "payment_request.completed",
          processed_at: "2026-07-04T09:00:00.000Z",
          payload: { id: "pi_orphan" },
        },
      ],
    });

    expect(exceptions.map((exception) => exception.exceptionType).sort()).toEqual([
      "failed_payment_allocation",
      "manual_flag",
      "orphan_provider_payment",
      "stale_pending_payment",
    ]);
  });

  it("keeps manual reconciliation from reusing another record's payment reference", async () => {
    const migration = await readFile(
      new URL(
        "../supabase/migrations/20260704114220_harden_admin_order_actions.sql",
        import.meta.url
      ),
      "utf8"
    );

    expect(migration).toContain("payment reference belongs to another record");
    expect(migration).toContain("where public.payments.order_id = excluded.order_id");
    expect(migration).toContain("and public.payments.preorder_id is null");
    expect(migration).toContain("returning public.payments.id into v_payment_id");
    expect(migration).toContain("order already has a captured payment");
    expect(migration).toContain("create or replace function public.mark_order_paid");
  });

  it("builds manual reconciliation actions from required admin form fields", () => {
    const form = new FormData();
    form.set("action", "record_manual_reconciliation");
    form.set("orderId", "11111111-1111-4111-8111-111111111111");
    form.set("provider", "hitpay");
    form.set("providerPaymentId", "pi_manual_123");
    form.set("amountCents", "19900");
    form.set("currency", "sgd");
    form.set("reason", "operator matched HitPay dashboard payment");

    expect(adminOrderActionFromForm(form)).toEqual({
      orderId: "11111111-1111-4111-8111-111111111111",
      body: {
        action: "record_manual_reconciliation",
        provider: "hitpay",
        providerPaymentId: "pi_manual_123",
        amountCents: 19900,
        currency: "SGD",
        reason: "operator matched HitPay dashboard payment",
      },
    });
  });

  it("rejects reconciliation forms without a positive integer amount", () => {
    const form = new FormData();
    form.set("action", "record_manual_reconciliation");
    form.set("orderId", "11111111-1111-4111-8111-111111111111");
    form.set("provider", "hitpay");
    form.set("providerPaymentId", "pi_manual_123");
    form.set("amountCents", "0");
    form.set("currency", "SGD");
    form.set("reason", "operator matched HitPay dashboard payment");

    expect(() => adminOrderActionFromForm(form)).toThrow("amountCents must be at least 1");
  });
});

function fakeSupabase() {
  const calls: { rpc: Array<{ name: string; params: unknown }> } = { rpc: [] };
  const supabase = {
    rpc: vi.fn(async (name: string, params: unknown) => {
      calls.rpc.push({ name, params });
      return { data: null, error: null };
    }),
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(async () => ({
            data: { id: "11111111-1111-4111-8111-111111111111", status: "paid" },
            error: null,
          })),
        })),
      })),
    })),
  };
  return { supabase, calls };
}
