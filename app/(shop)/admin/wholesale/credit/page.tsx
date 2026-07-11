import Link from "next/link";
import { PageHeader } from "@/app/_components/page-header";
import { StatusBadge } from "@/app/_components/status-badge";
import { saveB2bCreditTerms, saveB2bInvoicePolicy } from "@/app/actions/b2b-credit";
import { requireStaff } from "@/lib/auth";
import { formatMoney } from "@/lib/money";
import { createServiceClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

interface CreditAccount {
  id: string;
  companyName: string;
  customerName: string | null;
  customerEmail: string | null;
  paymentTerms: string;
  creditLimitCents: number;
}

interface InvoicePolicy {
  enabled: boolean;
  reservationHours: number;
  maxPaymentTermDays: number;
}

export default async function B2bCreditPage() {
  await requireStaff("/admin/wholesale/credit");
  const supabase = createServiceClient();
  const [accounts, policy] = await Promise.all([
    fetchCreditAccounts(supabase),
    fetchInvoicePolicy(supabase),
  ]);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Admin / Wholesale"
        title="Invoice credit and reservation controls"
        description="Configure explicit account credit terms and the global fail-closed invoice policy. Every change is audited by the database functions."
        action={
          <StatusBadge tone={policy.enabled ? "success" : "warning"}>
            {policy.enabled ? "Invoice checkout enabled" : "Invoice checkout disabled"}
          </StatusBadge>
        }
      />

      <div className="flex flex-wrap gap-3 text-sm">
        <Link className="font-semibold text-emerald-700 hover:text-emerald-900" href="/admin">
          Back to admin
        </Link>
        <Link className="font-semibold text-emerald-700 hover:text-emerald-900" href="/cart?channel=b2b">
          Review B2B cart
        </Link>
      </div>

      <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-zinc-950">Global invoice policy</h2>
            <p className="mt-1 max-w-3xl text-sm text-zinc-600">
              Keep this disabled until CRON_SECRET is provisioned, the hourly expiry job is verified,
              and every invoice-enabled account has reviewed NET terms and a positive credit limit.
            </p>
          </div>
        </div>

        <form action={saveB2bInvoicePolicy} className="mt-5 grid gap-4 rounded-md border border-zinc-200 bg-zinc-50 p-4 md:grid-cols-3">
          <label className="grid gap-1 text-xs font-medium text-zinc-700">
            Reservation hours
            <input
              className="min-h-10 rounded-md border border-zinc-300 px-3 text-sm"
              defaultValue={policy.reservationHours}
              max={168}
              min={1}
              name="reservationHours"
              required
              type="number"
            />
          </label>
          <label className="grid gap-1 text-xs font-medium text-zinc-700">
            Maximum payment term days
            <input
              className="min-h-10 rounded-md border border-zinc-300 px-3 text-sm"
              defaultValue={policy.maxPaymentTermDays}
              max={90}
              min={1}
              name="maxPaymentTermDays"
              required
              type="number"
            />
          </label>
          <label className="flex min-h-10 items-center gap-2 self-end rounded-md border border-zinc-300 bg-white px-3 text-sm font-medium text-zinc-800">
            <input defaultChecked={policy.enabled} name="enabled" type="checkbox" />
            Enable invoice checkout
          </label>
          <button className="min-h-10 rounded-md bg-zinc-950 px-4 text-sm font-semibold text-white hover:bg-emerald-700 md:col-span-3">
            Save invoice policy
          </button>
        </form>
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-zinc-950">Approved account credit terms</h2>
            <p className="mt-1 text-sm text-zinc-600">
              Exposure is checked transactionally against pending, unexpired manual-invoice orders.
            </p>
          </div>
          <StatusBadge tone="info">{accounts.length} approved accounts</StatusBadge>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          {accounts.length === 0 ? (
            <p className="rounded-md border border-dashed border-zinc-300 p-5 text-sm text-zinc-600 lg:col-span-2">
              No approved B2B accounts are available for credit configuration.
            </p>
          ) : (
            accounts.map((account) => (
              <article key={account.id} className="rounded-md border border-zinc-200 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold text-zinc-950">{account.companyName}</h3>
                    <p className="mt-1 text-sm text-zinc-500">
                      {account.customerName ?? account.customerEmail ?? "Customer"}
                    </p>
                  </div>
                  <StatusBadge tone={account.creditLimitCents > 0 && account.paymentTerms.startsWith("NET") ? "success" : "warning"}>
                    {account.creditLimitCents > 0 && account.paymentTerms.startsWith("NET")
                      ? "Invoice eligible"
                      : "Prepaid only"}
                  </StatusBadge>
                </div>

                <dl className="mt-3 grid gap-1 text-xs text-zinc-600">
                  <div className="flex justify-between gap-3">
                    <dt>Current terms</dt>
                    <dd className="font-semibold text-zinc-900">{account.paymentTerms}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt>Credit limit</dt>
                    <dd className="font-semibold text-zinc-900">
                      {formatMoney(account.creditLimitCents, "SGD")}
                    </dd>
                  </div>
                </dl>

                <form action={saveB2bCreditTerms} className="mt-4 grid gap-3 sm:grid-cols-2">
                  <input name="accountId" type="hidden" value={account.id} />
                  <label className="grid gap-1 text-xs font-medium text-zinc-700">
                    Payment terms
                    <input
                      className="min-h-10 rounded-md border border-zinc-300 px-3 text-sm uppercase"
                      defaultValue={account.paymentTerms.startsWith("NET") ? account.paymentTerms : "NET30"}
                      name="paymentTerms"
                      pattern="NET([1-9]|[1-8][0-9]|90)"
                      required
                    />
                  </label>
                  <label className="grid gap-1 text-xs font-medium text-zinc-700">
                    Credit limit cents
                    <input
                      className="min-h-10 rounded-md border border-zinc-300 px-3 text-sm"
                      defaultValue={account.creditLimitCents || ""}
                      min={1}
                      name="creditLimitCents"
                      required
                      type="number"
                    />
                  </label>
                  <button className="min-h-10 rounded-md border border-zinc-300 px-4 text-sm font-semibold text-zinc-800 hover:border-emerald-600 hover:text-emerald-700 sm:col-span-2">
                    Save reviewed credit terms
                  </button>
                </form>
              </article>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

async function fetchCreditAccounts(
  supabase = createServiceClient()
): Promise<CreditAccount[]> {
  const { data, error } = await supabase
    .from("b2b_accounts")
    .select("id, company_name, payment_terms, credit_limit_cents, customers(name, email)")
    .eq("approved", true)
    .eq("review_status", "approved")
    .order("updated_at", { ascending: false });

  if (error) {
    throw new Error(`B2B credit account query failed: ${error.message}`);
  }

  return ((data ?? []) as unknown as Array<{
    id: string;
    company_name: string;
    payment_terms: string;
    credit_limit_cents: number;
    customers: { name: string | null; email: string | null } | null;
  }>).map((row) => ({
    id: row.id,
    companyName: row.company_name,
    customerName: row.customers?.name ?? null,
    customerEmail: row.customers?.email ?? null,
    paymentTerms: row.payment_terms,
    creditLimitCents: Number(row.credit_limit_cents ?? 0),
  }));
}

async function fetchInvoicePolicy(
  supabase = createServiceClient()
): Promise<InvoicePolicy> {
  const { data, error } = await supabase
    .from("storefront_configurations")
    .select("active, value")
    .eq("key", "b2b_invoice_policy")
    .maybeSingle();

  if (error) {
    throw new Error(`B2B invoice policy query failed: ${error.message}`);
  }

  const value = (data?.value ?? {}) as Record<string, unknown>;
  return {
    enabled: Boolean(data?.active && value.enabled === true),
    reservationHours: boundedInteger(value.reservationHours, 24, 1, 168),
    maxPaymentTermDays: boundedInteger(value.maxPaymentTermDays, 30, 1, 90),
  };
}

function boundedInteger(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}
