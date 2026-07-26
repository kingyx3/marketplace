import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

import {
  financeExceptionLabel,
  financeSeverityLabel,
  financeSourceLabel,
  matchesFinanceException,
  parseFinanceRelation,
  parseFinanceSeverity,
  parseFinanceSort,
  parseFinanceSource,
  sortFinanceExceptions,
  type FinanceExceptionContext,
} from "@/lib/control-finance-view";
import type { AdminOrderException } from "@/lib/orders";

const context: FinanceExceptionContext = {
  customerId: "customer-1",
  customerName: "Ada Lovelace",
  customerEmail: "ada@example.test",
  orderStatus: "pending_payment",
  orderTotalCents: 19900,
  orderCurrency: "SGD",
  paymentStatus: "failed",
  paymentAmountCents: 19900,
  paymentCurrency: "SGD",
  paymentProvider: "hitpay",
  paymentProviderReference: "provider-1",
};

describe("control finance workspace", () => {
  it("normalizes supported queue controls and rejects stale values", () => {
    expect(parseFinanceSeverity("critical")).toBe("critical");
    expect(parseFinanceSeverity("urgent")).toBe("all");
    expect(parseFinanceSource("manual")).toBe("manual");
    expect(parseFinanceSource("provider")).toBe("all");
    expect(parseFinanceRelation("provider_only")).toBe("provider_only");
    expect(parseFinanceRelation("unlinked")).toBe("all");
    expect(parseFinanceSort("customer")).toBe("customer");
    expect(parseFinanceSort("severity")).toBe("action");
  });

  it("provides human labels without hiding exact system states", () => {
    expect(financeExceptionLabel("amount_currency_mismatch")).toBe("Amount or currency mismatch");
    expect(financeSeverityLabel("info")).toBe("Information");
    expect(financeSourceLabel("derived")).toBe("System-detected");
  });

  it("searches customer context and exact operational identifiers", () => {
    const exception = buildException();
    expect(matchesFinanceException(exception, "Ada", context)).toBe(true);
    expect(matchesFinanceException(exception, "order-1", context)).toBe(true);
    expect(matchesFinanceException(exception, "provider-1", context)).toBe(true);
    expect(matchesFinanceException(exception, "unrelated", context)).toBe(false);
  });

  it("prioritizes severity and linked next actions before passive history", () => {
    const warning = buildException({ key: "warning", severity: "warning", orderId: null });
    const criticalUnlinked = buildException({
      key: "critical-unlinked",
      severity: "critical",
      orderId: null,
    });
    const criticalLinked = buildException({
      key: "critical-linked",
      severity: "critical",
      orderId: "order-1",
    });
    expect(
      sortFinanceExceptions([warning, criticalUnlinked, criticalLinked], "action", new Map()).map(
        (exception) => exception.key
      )
    ).toEqual(["critical-linked", "critical-unlinked", "warning"]);
  });

  it("ships active filters, exact references, monetary context, and bounded pagination", async () => {
    const source = await readFile(
      new URL("../app/(shop)/control/finance/page.tsx", import.meta.url),
      "utf8"
    );

    expect(source).toContain('aria-label="Active finance filters"');
    expect(source).toContain('name="severity"');
    expect(source).toContain('name="source"');
    expect(source).toContain('name="relation"');
    expect(source).toContain('name="sort"');
    expect(source).toContain("Order ID");
    expect(source).toContain("Payment ID");
    expect(source).toContain("HitPay reference");
    expect(source).toContain("System:");
    expect(source).toContain("Order total");
    expect(source).toContain("Payment amount");
    expect(source).toContain("const PAGE_SIZE = 24");
  });

  it("keeps reconciliation permission-gated on the exception detail", async () => {
    const source = await readFile(
      new URL("../app/(shop)/control/finance/exceptions/[exceptionKey]/page.tsx", import.meta.url),
      "utf8"
    );
    expect(source).toContain('hasControlPermission(staff, "payments.reconcile")');
    expect(source).toContain("<ManualReconciliationForm");
    expect(source).toContain('label="Order ID"');
    expect(source).toContain('label="Payment ID"');
    expect(source).toContain('label="HitPay reference"');
    expect(source).toContain('label="System exception type"');
  });
});

function buildException(overrides: Partial<AdminOrderException> = {}): AdminOrderException {
  return {
    key: "exception-1",
    source: "derived",
    exceptionType: "failed_payment_allocation",
    severity: "critical",
    orderId: "order-1",
    paymentId: "payment-1",
    providerPaymentId: "provider-1",
    detail: "Payment failed while the order remains pending.",
    createdAt: "2026-07-25T00:00:00.000Z",
    ...overrides,
  };
}
