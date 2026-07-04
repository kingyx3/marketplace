import Link from "next/link";

import { PageHeader } from "@/app/_components/page-header";
import { StatusBadge } from "@/app/_components/status-badge";
import { applyForWholesale } from "@/app/actions/account";
import { getCurrentUser, getCustomerProfile } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function WholesalePage() {
  const user = await getCurrentUser();
  const customer = user ? await getCustomerProfile(user.id) : null;
  const account = customer ? await getB2bAccount(customer.id) : null;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Wholesale"
        title="B2B sealed allocation"
        description="Approved retailers can request wholesale pricing, case quantities, and purchase-order style fulfillment. Approval is reviewed by staff before discounts apply."
        action={
          <StatusBadge tone={account?.approved ? "success" : account ? "warning" : "neutral"}>
            {account?.approved ? "Approved" : account ? "Under review" : "Application required"}
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
              href="/auth/sign-in?next=/wholesale"
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
                Submit for review
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
              {account
                ? account.approved
                  ? "Your wholesale account is approved."
                  : "Your application is waiting for staff review."
                : "No wholesale application has been submitted for this account."}
            </p>
          </div>
        </aside>
      </section>
    </div>
  );
}

async function getB2bAccount(customerId: string) {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("b2b_accounts")
    .select("id, company_name, business_reg_no, approved, approved_at")
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
  } | null;
}
