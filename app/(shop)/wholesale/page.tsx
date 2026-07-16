import Link from "next/link";

import { PageHeader } from "@/app/_components/page-header";
import { StatusBadge } from "@/app/_components/status-badge";
import { applyForWholesale } from "@/app/actions/account";
import { getCurrentUser, getCustomerProfile } from "@/lib/auth";
import {
  formatDiscountBps,
  getWholesaleAccess,
  minimumOrderCents,
  maxDiscountBps,
} from "@/lib/b2b";
import { formatMoney } from "@/lib/money";
import { createServiceClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function WholesalePage() {
  const user = await getCurrentUser();
  const { account, wholesaleAccess } = await currentWholesaleContext(user?.id);
  const status = accountStatus(account);
  const assignedDiscount = maxDiscountBps(wholesaleAccess?.tiers ?? []);
  const assignedMinimum = minimumOrderCents(wholesaleAccess?.tiers ?? []);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Wholesale"
        title="B2B sealed allocation"
        description="Approved retailers can request wholesale pricing, case quantities, and purchase-order style fulfillment. Approval is reviewed by staff before discounts apply."
        action={
          <StatusBadge tone={statusTone(status)}>
            {status === "approved"
              ? "Approved"
              : status === "pending"
                ? "Under review"
                : status === "rejected"
                  ? "Rejected"
                  : "Application required"}
          </StatusBadge>
        }
      />

      <section className="grid gap-6 lg:grid-cols-[1fr_24rem]">
        <div className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-zinc-950">Apply for wholesale access</h2>
          <p className="mt-3 text-sm leading-6 text-zinc-600">
            Staff reviews business identity, order profile, and payment terms. Until approved, checkout
            stays on retail pricing and B2C limits.
          </p>

          {!user ? (
            <Link
              href="/sign-in?next=/wholesale"
              className="mt-6 inline-flex min-h-11 items-center justify-center rounded-md bg-zinc-950 px-5 text-sm font-semibold text-white hover:bg-emerald-700"
            >
              Sign in with Google
            </Link>
          ) : (
            <form action={applyForWholesale} className="mt-6 grid max-w-xl gap-4">
              <label className="grid gap-2 text-sm font-medium text-zinc-700">
                Company name
                <input
                  className="min-h-11 rounded-md border border-zinc-300 px-3 text-sm"
                  defaultValue={account?.company_name ?? ""}
                  maxLength={160}
                  name="companyName"
                  required
                />
              </label>
              <label className="grid gap-2 text-sm font-medium text-zinc-700">
                Business registration number
                <input
                  className="min-h-11 rounded-md border border-zinc-300 px-3 text-sm"
                  defaultValue={account?.business_reg_no ?? ""}
                  maxLength={80}
                  name="businessRegNo"
                />
              </label>
              <button className="min-h-11 rounded-md bg-zinc-950 px-5 text-sm font-semibold text-white hover:bg-emerald-700">
                {status === "rejected" ? "Resubmit for review" : "Submit for review"}
              </button>
            </form>
          )}
        </div>

        <aside className="space-y-4">
          <div className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-zinc-950">Approval rules</h2>
            <ul className="mt-4 grid gap-3 text-sm leading-6 text-zinc-600">
              <li>Business identity and purchase intent are reviewed by staff.</li>
              <li>Wholesale discounts apply only after approval.</li>
              <li>Minimum order values are enforced server-side at checkout.</li>
            </ul>
          </div>
          <div className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-zinc-950">Current status</h2>
            <p className="mt-3 text-sm text-zinc-600">
              {status === "approved"
                ? "Your wholesale account is approved."
                : status === "pending"
                  ? "Your application is waiting for staff review."
                  : status === "rejected"
                    ? "Your application was rejected. Update the details and resubmit when ready."
                    : "No wholesale application has been submitted for this account."}
            </p>
            {status === "approved" && assignedDiscount > 0 ? (
              <dl className="mt-4 grid gap-3 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-zinc-500">Assigned tier</dt>
                  <dd className="font-semibold text-zinc-950">
                    {wholesaleAccess?.tiers.map((tier) => tier.name).join(", ")}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-zinc-500">Best discount</dt>
                  <dd className="font-semibold text-zinc-950">
                    {formatDiscountBps(assignedDiscount)}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-zinc-500">Minimum order</dt>
                  <dd className="font-semibold text-zinc-950">
                    {formatMoney(assignedMinimum)}
                  </dd>
                </div>
              </dl>
            ) : null}
            {status === "approved" && assignedDiscount === 0 ? (
              <p className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                Your account is approved, but a pricing tier has not been assigned yet.
              </p>
            ) : null}
          </div>
        </aside>
      </section>
    </div>
  );
}

async function currentWholesaleContext(authUserId?: string) {
  if (!authUserId) return { account: null, wholesaleAccess: null };

  try {
    const customer = await getCustomerProfile(authUserId);
    if (!customer) return { account: null, wholesaleAccess: null };
    const supabase = createServiceClient();
    const [account, wholesaleAccess] = await Promise.all([
      getB2bAccount(supabase, customer.id),
      getWholesaleAccess(supabase, customer.id),
    ]);
    return { account, wholesaleAccess };
  } catch (error) {
    console.error("wholesale account lookup failed:", safeError(error));
    return { account: null, wholesaleAccess: null };
  }
}

async function getB2bAccount(supabase: ReturnType<typeof createServiceClient>, customerId: string) {
  const { data, error } = await supabase
    .from("b2b_accounts")
    .select("id, company_name, business_reg_no, approved, approved_at, review_status, reviewed_at, review_note")
    .eq("customer_id", customerId)
    .maybeSingle();

  if (error) {
    throw new Error(`Wholesale lookup failed: ${error.message}`);
  }

  return data as {
    id: string;
    company_name: string;
    business_reg_no: string | null;
    approved: boolean;
    approved_at: string | null;
    review_status: "pending" | "approved" | "rejected";
    reviewed_at: string | null;
    review_note: string | null;
  } | null;
}

function accountStatus(account: Awaited<ReturnType<typeof getB2bAccount>>) {
  if (!account) return "none" as const;
  if (account.review_status === "approved" || account.approved) return "approved" as const;
  if (account.review_status === "rejected") return "rejected" as const;
  return "pending" as const;
}

function statusTone(status: ReturnType<typeof accountStatus>) {
  if (status === "approved") return "success" as const;
  if (status === "rejected") return "danger" as const;
  if (status === "pending") return "warning" as const;
  return "neutral" as const;
}

function safeError(error: unknown): string {
  return error instanceof Error ? error.message : "unknown";
}
