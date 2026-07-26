import type { SupabaseClient } from "@supabase/supabase-js";
import Link from "next/link";
import { redirect } from "next/navigation";

import {
  ControlData,
  ControlEmptyState,
} from "@/app/(shop)/control/_components/control-resource-ui";
import { MetricCard } from "@/app/_components/metric-card";
import { PageHeader } from "@/app/_components/page-header";
import { StatusBadge } from "@/app/_components/status-badge";
import { hasControlPermission, requireControlPermission } from "@/lib/control-access";
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
  type FinanceExceptionSort,
  type FinanceRelationFilter,
  type FinanceSeverityFilter,
  type FinanceSourceFilter,
} from "@/lib/control-finance-view";
import { formatMoney } from "@/lib/money";
import { listAdminOrderExceptions } from "@/lib/order-exceptions";
import type { AdminOrderException } from "@/lib/orders";
import { createSecretClient } from "@/lib/supabase";
import { toOne } from "@/lib/supabase-relations";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 24;

interface FinanceSearchParams {
  q?: string;
  severity?: string;
  source?: string;
  relation?: string;
  sort?: string;
  page?: string;
  reconciled?: string;
}

interface FinanceOrderRow {
  id: string;
  status: string;
  total_cents: number;
  currency: string;
  customers:
    | { id: string; email: string; name: string | null }
    | Array<{ id: string; email: string; name: string | null }>
    | null;
}

interface FinancePaymentRow {
  id: string;
  provider: string;
  provider_payment_id: string | null;
  amount_cents: number;
  currency: string;
  status: string;
}

export default async function ControlFinancePage({
  searchParams,
}: {
  searchParams?: Promise<FinanceSearchParams>;
}) {
  const { staff } = await requireControlPermission("finance.view", "/control/finance");
  const params = (await searchParams) ?? {};
  const query = (params.q ?? "").trim().slice(0, 160);
  const severity = parseFinanceSeverity(params.severity);
  const source = parseFinanceSource(params.source);
  const relation = parseFinanceRelation(params.relation);
  const sort = parseFinanceSort(params.sort);
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const supabase = createSecretClient();
  const exceptions = await listAdminOrderExceptions(supabase);
  const contexts = await loadFinanceContexts(supabase, exceptions);
  const matchingExceptions = sortFinanceExceptions(
    exceptions.filter(
      (exception) =>
        (severity === "all" || exception.severity === severity) &&
        (source === "all" || exception.source === source) &&
        (relation === "all" ||
          (relation === "local_order" ? Boolean(exception.orderId) : !exception.orderId)) &&
        matchesFinanceException(exception, query, contexts.get(exception.key))
    ),
    sort,
    contexts
  );
  const totalPages = Math.max(1, Math.ceil(matchingExceptions.length / PAGE_SIZE));
  const normalizedFilters = { query, severity, source, relation, sort };
  if (page > totalPages) redirect(financePageHref(normalizedFilters, totalPages));
  const visibleExceptions = matchingExceptions.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const critical = exceptions.filter((exception) => exception.severity === "critical").length;
  const canReconcile = hasControlPermission(staff, "payments.reconcile");
  const hasActiveFilters =
    Boolean(query) ||
    severity !== "all" ||
    source !== "all" ||
    relation !== "all" ||
    sort !== "action";

  return (
    <div className="space-y-8">
      <PageHeader
        action={
          canReconcile ? (
            <Link
              className="inline-flex min-h-11 items-center rounded-md bg-zinc-950 px-4 text-sm font-semibold text-white hover:bg-emerald-700"
              href="/control/finance/reconciliations/new"
            >
              Create reconciliation
            </Link>
          ) : undefined
        }
        description="Find the exact payment exception, verify customer and provider context, and review financial impact before reconciling."
        eyebrow="Control"
        title="Finance"
      />

      {params.reconciled === "1" ? (
        <div
          className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900"
          role="status"
        >
          Manual reconciliation recorded successfully. Refresh the matching exception to verify its
          current system state.
        </div>
      ) : null}

      {critical > 0 ? (
        <section
          aria-labelledby="critical-payment-exceptions-title"
          className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-rose-200 bg-rose-50 p-5"
        >
          <div>
            <h2 className="font-semibold text-rose-950" id="critical-payment-exceptions-title">
              {critical} critical payment exception{critical === 1 ? "" : "s"} require review
            </h2>
            <p className="mt-1 text-sm leading-6 text-rose-900">
              Critical records can indicate a completed provider payment without a local record or a
              failed payment still attached to an unpaid order.
            </p>
          </div>
          <Link
            className="inline-flex min-h-11 items-center rounded-md border border-rose-300 bg-white px-4 text-sm font-semibold text-rose-950 hover:border-rose-500"
            href="/control/finance?severity=critical"
          >
            Review critical exceptions
          </Link>
        </section>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Open exceptions"
          value={String(exceptions.length)}
          detail="Bounded operational queue"
        />
        <MetricCard
          label="Matching exceptions"
          value={String(matchingExceptions.length)}
          detail="Current search and filters"
        />
        <MetricCard label="Critical" value={String(critical)} detail="Highest priority" />
        <MetricCard
          label="Reconciliation"
          value={canReconcile ? "Enabled" : "Read only"}
          detail="Current access coverage"
        />
      </section>

      <form className="grid gap-3 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm xl:grid-cols-[minmax(0,1fr)_10rem_11rem_11rem_12rem_auto]">
        <label className="grid gap-1 text-sm font-medium text-zinc-700">
          Search exceptions
          <input
            className="min-h-11 rounded-md border border-zinc-300 px-3 text-base sm:text-sm"
            defaultValue={query}
            maxLength={160}
            name="q"
            placeholder="Customer, order, payment, or HitPay reference"
          />
        </label>
        <label className="grid gap-1 text-sm font-medium text-zinc-700">
          Severity
          <select
            className="min-h-11 rounded-md border border-zinc-300 px-3 text-base sm:text-sm"
            defaultValue={severity}
            name="severity"
          >
            <option value="all">All severities</option>
            <option value="critical">Critical</option>
            <option value="warning">Warning</option>
            <option value="info">Information</option>
          </select>
        </label>
        <label className="grid gap-1 text-sm font-medium text-zinc-700">
          Detection
          <select
            className="min-h-11 rounded-md border border-zinc-300 px-3 text-base sm:text-sm"
            defaultValue={source}
            name="source"
          >
            <option value="all">All detection</option>
            <option value="derived">System-detected</option>
            <option value="manual">Staff-reported</option>
          </select>
        </label>
        <label className="grid gap-1 text-sm font-medium text-zinc-700">
          Record link
          <select
            className="min-h-11 rounded-md border border-zinc-300 px-3 text-base sm:text-sm"
            defaultValue={relation}
            name="relation"
          >
            <option value="all">All records</option>
            <option value="local_order">Linked order</option>
            <option value="provider_only">Provider-only</option>
          </select>
        </label>
        <label className="grid gap-1 text-sm font-medium text-zinc-700">
          Sort
          <select
            className="min-h-11 rounded-md border border-zinc-300 px-3 text-base sm:text-sm"
            defaultValue={sort}
            name="sort"
          >
            <option value="action">Action required first</option>
            <option value="recent">Most recently detected</option>
            <option value="oldest">Oldest detected first</option>
            <option value="customer">Customer name</option>
          </select>
        </label>
        <button className="min-h-11 self-end rounded-md bg-zinc-950 px-5 text-sm font-semibold text-white hover:bg-emerald-700">
          Apply
        </button>
      </form>

      {hasActiveFilters ? (
        <aside
          aria-label="Active finance filters"
          className="flex flex-wrap items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-950"
        >
          <span className="font-semibold">Active filters:</span>
          {query ? <FilterChip>Search: “{query}”</FilterChip> : null}
          {severity !== "all" ? (
            <FilterChip>Severity: {financeSeverityLabel(severity)}</FilterChip>
          ) : null}
          {source !== "all" ? (
            <FilterChip>Detection: {financeSourceLabel(source)}</FilterChip>
          ) : null}
          {relation !== "all" ? <FilterChip>Record: {relationLabel(relation)}</FilterChip> : null}
          {sort !== "action" ? <FilterChip>Sort: {sortLabel(sort)}</FilterChip> : null}
          <Link className="ml-auto font-semibold underline" href="/control/finance">
            Clear all
          </Link>
        </aside>
      ) : null}

      {visibleExceptions.length === 0 ? (
        <ControlEmptyState
          action={
            hasActiveFilters ? (
              <Link
                className="font-semibold text-emerald-700 hover:text-emerald-800"
                href="/control/finance"
              >
                Clear filters
              </Link>
            ) : undefined
          }
          description={
            exceptions.length === 0
              ? "No open manual or system-detected payment exceptions are present."
              : "Broaden the search or clear one of the severity, detection, or record filters."
          }
          title={
            exceptions.length === 0
              ? "No open payment exceptions"
              : "No payment exceptions match this view"
          }
        />
      ) : (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-zinc-950">Payment exceptions</h2>
              <p className="mt-1 text-sm text-zinc-600">
                Customer context leads when available; exact order, payment, and provider references
                remain selectable for reconciliation and troubleshooting.
              </p>
            </div>
            <span className="text-sm text-zinc-500">
              {matchingExceptions.length} result{matchingExceptions.length === 1 ? "" : "s"} · page{" "}
              {page} of {totalPages}
            </span>
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            {visibleExceptions.map((exception) => (
              <FinanceExceptionCard
                canReconcile={canReconcile}
                context={contexts.get(exception.key)}
                exception={exception}
                key={exception.key}
              />
            ))}
          </div>
        </section>
      )}

      {totalPages > 1 ? (
        <nav
          aria-label="Finance exception pages"
          className="flex items-center justify-between gap-3"
        >
          <PaginationLink disabled={page <= 1} href={financePageHref(normalizedFilters, page - 1)}>
            Previous
          </PaginationLink>
          <span className="text-sm text-zinc-500">
            Page {page} of {totalPages}
          </span>
          <PaginationLink
            disabled={page >= totalPages}
            href={financePageHref(normalizedFilters, page + 1)}
          >
            Next
          </PaginationLink>
        </nav>
      ) : null}
    </div>
  );
}

function FinanceExceptionCard({
  exception,
  context,
  canReconcile,
}: {
  exception: AdminOrderException;
  context?: FinanceExceptionContext;
  canReconcile: boolean;
}) {
  const primaryLabel =
    context?.customerName ||
    context?.customerEmail ||
    (exception.orderId ? "Linked order exception" : "Provider payment investigation");
  return (
    <Link
      className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm transition hover:border-emerald-500 hover:shadow-md"
      href={`/control/finance/exceptions/${encodeURIComponent(exception.key)}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="truncate font-semibold text-zinc-950">{primaryLabel}</h3>
          {context?.customerEmail && context.customerEmail !== primaryLabel ? (
            <p className="mt-1 break-all text-sm text-zinc-600">{context.customerEmail}</p>
          ) : null}
          <p className="mt-2 font-medium text-zinc-800">
            {financeExceptionLabel(exception.exceptionType)}
          </p>
          <dl className="mt-3 grid gap-1 text-xs text-zinc-500">
            <Identifier label="Order ID" value={exception.orderId} />
            <Identifier label="Payment ID" value={exception.paymentId} />
            <Identifier
              label="HitPay reference"
              value={exception.providerPaymentId ?? context?.paymentProviderReference ?? null}
            />
            {context?.customerId ? (
              <Identifier label="Customer ID" value={context.customerId} />
            ) : null}
          </dl>
        </div>
        <div className="grid justify-items-end gap-2">
          <StatusBadge tone={severityTone(exception.severity)}>
            {financeSeverityLabel(exception.severity)}
          </StatusBadge>
          <StatusBadge tone={exception.source === "manual" ? "info" : "neutral"}>
            {financeSourceLabel(exception.source)}
          </StatusBadge>
          <p className="font-mono text-xs text-zinc-400">
            System: {exception.exceptionType} · {exception.severity} · {exception.source}
          </p>
        </div>
      </div>
      <p className="mt-4 text-sm leading-6 text-zinc-600">{exception.detail}</p>
      <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-4">
        <ControlData
          label="Order total"
          value={
            context?.orderTotalCents != null && context.orderCurrency
              ? formatMoney(context.orderTotalCents, context.orderCurrency)
              : "Not available"
          }
        />
        <ControlData
          label="Payment amount"
          value={
            context?.paymentAmountCents != null && context.paymentCurrency
              ? formatMoney(context.paymentAmountCents, context.paymentCurrency)
              : "Not available"
          }
        />
        <ControlData label="Detected" value={formatDate(exception.createdAt)} />
        <ControlData
          label="Next step"
          value={
            exception.orderId && canReconcile
              ? "Review and reconcile →"
              : exception.orderId
                ? "Review evidence →"
                : "Investigate provider reference →"
          }
        />
      </dl>
      {context?.orderStatus || context?.paymentStatus ? (
        <p className="mt-4 font-mono text-xs text-zinc-400">
          Related systems: order {context.orderStatus ?? "not linked"} · payment{" "}
          {context.paymentStatus ?? "not linked"}
          {context.paymentProvider ? ` · provider ${context.paymentProvider}` : ""}
        </p>
      ) : null}
    </Link>
  );
}

function Identifier({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="inline font-medium">{label} </dt>
      <dd className="inline select-all break-all font-mono">{value ?? "Not linked"}</dd>
    </div>
  );
}

async function loadFinanceContexts(
  supabase: SupabaseClient,
  exceptions: AdminOrderException[]
): Promise<Map<string, FinanceExceptionContext>> {
  const orderIds = [...new Set(exceptions.flatMap((item) => (item.orderId ? [item.orderId] : [])))];
  const paymentIds = [
    ...new Set(exceptions.flatMap((item) => (item.paymentId ? [item.paymentId] : []))),
  ];
  const [orderResult, paymentResult] = await Promise.all([
    orderIds.length
      ? supabase
          .from("orders")
          .select("id, status, total_cents, currency, customers(id, email, name)")
          .in("id", orderIds)
      : Promise.resolve({ data: [], error: null }),
    paymentIds.length
      ? supabase
          .from("payments")
          .select("id, provider, provider_payment_id, amount_cents, currency, status")
          .in("id", paymentIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (orderResult.error)
    throw new Error(`Finance order context failed: ${orderResult.error.message}`);
  if (paymentResult.error)
    throw new Error(`Finance payment context failed: ${paymentResult.error.message}`);

  const orders = new Map(
    ((orderResult.data ?? []) as unknown as FinanceOrderRow[]).map((order) => [order.id, order])
  );
  const payments = new Map(
    ((paymentResult.data ?? []) as FinancePaymentRow[]).map((payment) => [payment.id, payment])
  );
  return new Map(
    exceptions.map((exception) => {
      const order = exception.orderId ? orders.get(exception.orderId) : undefined;
      const customer = toOne(order?.customers);
      const payment = exception.paymentId ? payments.get(exception.paymentId) : undefined;
      return [
        exception.key,
        {
          customerId: customer?.id ?? null,
          customerName: customer?.name ?? null,
          customerEmail: customer?.email ?? null,
          orderStatus: order?.status ?? null,
          orderTotalCents: order?.total_cents ?? null,
          orderCurrency: order?.currency ?? null,
          paymentStatus: payment?.status ?? null,
          paymentAmountCents: payment?.amount_cents ?? null,
          paymentCurrency: payment?.currency ?? null,
          paymentProvider: payment?.provider ?? null,
          paymentProviderReference: payment?.provider_payment_id ?? null,
        },
      ];
    })
  );
}

function FilterChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-emerald-300 bg-white px-3 py-1">{children}</span>
  );
}

function PaginationLink({
  href,
  disabled,
  children,
}: {
  href: string;
  disabled: boolean;
  children: React.ReactNode;
}) {
  if (disabled) {
    return (
      <span className="rounded-md border border-zinc-200 px-4 py-2 text-sm text-zinc-400">
        {children}
      </span>
    );
  }
  return (
    <Link
      className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-700 hover:border-emerald-600 hover:text-emerald-700"
      href={href}
    >
      {children}
    </Link>
  );
}

function financePageHref(
  filters: {
    query: string;
    severity: FinanceSeverityFilter;
    source: FinanceSourceFilter;
    relation: FinanceRelationFilter;
    sort: FinanceExceptionSort;
  },
  page: number
): string {
  const search = new URLSearchParams();
  if (filters.query) search.set("q", filters.query);
  if (filters.severity !== "all") search.set("severity", filters.severity);
  if (filters.source !== "all") search.set("source", filters.source);
  if (filters.relation !== "all") search.set("relation", filters.relation);
  if (filters.sort !== "action") search.set("sort", filters.sort);
  if (page > 1) search.set("page", String(page));
  const value = search.toString();
  return value ? `/control/finance?${value}` : "/control/finance";
}

function severityTone(value: AdminOrderException["severity"]): "danger" | "warning" | "info" {
  return value === "critical" ? "danger" : value === "warning" ? "warning" : "info";
}

function relationLabel(value: FinanceRelationFilter): string {
  return value === "local_order" ? "Linked order" : "Provider-only";
}

function sortLabel(value: FinanceExceptionSort): string {
  return {
    action: "Action required first",
    recent: "Most recently detected",
    oldest: "Oldest detected first",
    customer: "Customer name",
  }[value];
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-SG", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Singapore",
  }).format(new Date(value));
}
