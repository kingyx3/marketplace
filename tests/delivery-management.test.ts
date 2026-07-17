import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

import { netCapturedPaymentTotal } from "@/lib/deliveries";

describe("delivery management", () => {
  it("counts direct and preorder-linked captured payments once and nets refunds", () => {
    expect(
      netCapturedPaymentTotal(
        [
          {
            id: "deposit",
            amount_cents: 2_000,
            currency: "SGD",
            status: "captured",
            refunds: [],
          },
          {
            id: "balance",
            amount_cents: 8_000,
            currency: "sgd",
            status: "captured",
            refunds: [{ amount_cents: 500, status: "succeeded" }],
          },
          {
            id: "balance",
            amount_cents: 8_000,
            currency: "SGD",
            status: "captured",
            refunds: [],
          },
          {
            id: "failed",
            amount_cents: 10_000,
            currency: "SGD",
            status: "failed",
            refunds: [],
          },
        ],
        "SGD"
      )
    ).toBe(9_500);
  });

  it("exposes delivery management only to order-management staff", async () => {
    const [page, actions, navigation] = await Promise.all([
      readFile(new URL("../app/(shop)/control/deliveries/page.tsx", import.meta.url), "utf8"),
      readFile(new URL("../app/actions/deliveries.ts", import.meta.url), "utf8"),
      readFile(
        new URL("../app/(shop)/control/_components/control-shell.tsx", import.meta.url),
        "utf8"
      ),
    ]);

    expect(page).toContain('requireControlPermission("manage_orders", "/control/deliveries")');
    expect(page).toContain("listAdminDeliveryOrders");
    expect(actions).toContain('requireControlPermission("manage_orders"');
    expect(actions).toContain('rpc("admin_arrange_delivery"');
    expect(actions).toContain('rpc("admin_update_delivery_status"');
    expect(navigation).toContain('/control/deliveries');
    expect(navigation).toContain('permission: "manage_orders"');
  });

  it("removes the misleading account-level billing status", async () => {
    const [account, customers, browserAuth, apiAuth, migration] = await Promise.all([
      readFile(new URL("../app/(shop)/account/page.tsx", import.meta.url), "utf8"),
      readFile(new URL("../app/(shop)/control/customers/page.tsx", import.meta.url), "utf8"),
      readFile(new URL("../lib/auth.ts", import.meta.url), "utf8"),
      readFile(new URL("../lib/api/auth.ts", import.meta.url), "utf8"),
      readFile(
        new URL("../supabase/migrations/20260717103000_delivery_management.sql", import.meta.url),
        "utf8"
      ),
    ]);

    for (const source of [account, customers, browserAuth, apiAuth]) {
      expect(source).not.toContain("billing_state");
    }
    expect(migration).toContain("drop column if exists billing_state");
  });

  it("guards packing and shipment changes with captured payment totals", async () => {
    const migration = await readFile(
      new URL("../supabase/migrations/20260717103000_delivery_management.sql", import.meta.url),
      "utf8"
    );

    expect(migration).toContain("order_captured_payment_total");
    expect(migration).toContain("payment.preorder_id in");
    expect(migration.match(/order payment incomplete/g)?.length).toBeGreaterThanOrEqual(3);
    expect(migration).toContain("ADMIN_ARRANGE_DELIVERY");
    expect(migration).toContain("ADMIN_UPDATE_DELIVERY_STATUS");
  });
});
