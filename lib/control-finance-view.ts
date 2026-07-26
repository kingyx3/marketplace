import type { AdminOrderException } from "@/lib/orders";

export type FinanceSeverityFilter = "all" | AdminOrderException["severity"];
export type FinanceSourceFilter = "all" | AdminOrderException["source"];
export type FinanceRelationFilter = "all" | "local_order" | "provider_only";
export type FinanceExceptionSort = "action" | "recent" | "oldest" | "customer";

export interface FinanceExceptionContext {
  customerId: string | null;
  customerName: string | null;
  customerEmail: string | null;
  orderStatus: string | null;
  orderTotalCents: number | null;
  orderCurrency: string | null;
  paymentStatus: string | null;
  paymentAmountCents: number | null;
  paymentCurrency: string | null;
  paymentProvider: string | null;
  paymentProviderReference: string | null;
}

export function parseFinanceSeverity(value?: string): FinanceSeverityFilter {
  return value === "critical" || value === "warning" || value === "info" ? value : "all";
}

export function parseFinanceSource(value?: string): FinanceSourceFilter {
  return value === "manual" || value === "derived" ? value : "all";
}

export function parseFinanceRelation(value?: string): FinanceRelationFilter {
  return value === "local_order" || value === "provider_only" ? value : "all";
}

export function parseFinanceSort(value?: string): FinanceExceptionSort {
  return value === "recent" || value === "oldest" || value === "customer" ? value : "action";
}

export function financeExceptionLabel(value: AdminOrderException["exceptionType"]): string {
  return {
    webhook_processing_failure: "Webhook processing failed",
    amount_currency_mismatch: "Amount or currency mismatch",
    orphan_provider_payment: "Provider payment not linked",
    stale_pending_payment: "Payment pending over 24 hours",
    failed_payment_allocation: "Failed payment still holds order",
    manual_flag: "Manually flagged payment",
  }[value];
}

export function financeSeverityLabel(value: AdminOrderException["severity"]): string {
  return value === "critical" ? "Critical" : value === "warning" ? "Warning" : "Information";
}

export function financeSourceLabel(value: AdminOrderException["source"]): string {
  return value === "manual" ? "Staff-reported" : "System-detected";
}

export function matchesFinanceException(
  exception: AdminOrderException,
  query: string,
  context?: FinanceExceptionContext
): boolean {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;
  return [
    financeExceptionLabel(exception.exceptionType),
    exception.exceptionType,
    exception.detail,
    exception.key,
    exception.orderId,
    exception.paymentId,
    exception.providerPaymentId,
    context?.customerId,
    context?.customerName,
    context?.customerEmail,
    context?.orderStatus,
    context?.paymentStatus,
    context?.paymentProvider,
    context?.paymentProviderReference,
  ].some((value) => value?.toLowerCase().includes(normalized));
}

export function sortFinanceExceptions(
  exceptions: AdminOrderException[],
  sort: FinanceExceptionSort,
  contexts: Map<string, FinanceExceptionContext>
): AdminOrderException[] {
  return [...exceptions].sort((left, right) => {
    if (sort === "oldest") return Date.parse(left.createdAt) - Date.parse(right.createdAt);
    if (sort === "customer") {
      const leftName = contexts.get(left.key)?.customerName ?? "\uffff";
      const rightName = contexts.get(right.key)?.customerName ?? "\uffff";
      return (
        leftName.localeCompare(rightName) ||
        Date.parse(right.createdAt) - Date.parse(left.createdAt)
      );
    }
    if (sort === "action") {
      const severityDifference = severityRank(right.severity) - severityRank(left.severity);
      if (severityDifference) return severityDifference;
      const relationDifference = Number(Boolean(right.orderId)) - Number(Boolean(left.orderId));
      if (relationDifference) return relationDifference;
    }
    return Date.parse(right.createdAt) - Date.parse(left.createdAt);
  });
}

function severityRank(value: AdminOrderException["severity"]): number {
  return value === "critical" ? 3 : value === "warning" ? 2 : 1;
}
