import type { Metadata } from "next";
import Link from "next/link";

import { DealCard } from "@/app/_components/deal-card";
import { PageHeader } from "@/app/_components/page-header";
import { StatusBadge } from "@/app/_components/status-badge";
import { getCurrentViewer } from "@/lib/auth";
import { getStorefrontDeals, PUBLIC_DEAL_PREVIEW_LIMIT } from "@/lib/deals";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Limited-time deals",
  description: "Current public previews and eligible signed-in marketplace deals.",
};

export default async function DealsPage() {
  const viewer = await getCurrentViewer();
  const signedIn = Boolean(viewer.user);
  const deals = await getStorefrontDeals({ signedIn });

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Deals"
        title="Limited-time sealed product offers"
        description={
          signedIn
            ? "You are seeing all active public and member deals currently available to signed-in customers."
            : `Public visitors can preview up to ${PUBLIC_DEAL_PREVIEW_LIMIT} active deals. Sign in to see the complete eligible list.`
        }
        action={
          <StatusBadge tone={signedIn ? "success" : "neutral"}>
            {signedIn ? "Member view" : "Public preview"}
          </StatusBadge>
        }
      />

      {deals.length > 0 ? (
        <section aria-label="Active deals" className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {deals.map((deal) => (
            <DealCard deal={deal} key={deal.id} />
          ))}
        </section>
      ) : (
        <section className="rounded-lg border border-zinc-200 bg-white p-8 text-center shadow-sm">
          <h2 className="text-xl font-semibold text-zinc-950">No active deals right now</h2>
          <p className="mt-3 text-sm text-zinc-600">
            Regular catalog prices and availability remain public while the next promotion is being
            prepared.
          </p>
          <Link
            className="mt-6 inline-flex min-h-11 items-center justify-center rounded-md bg-zinc-950 px-5 text-sm font-semibold text-white hover:bg-emerald-700"
            href="/catalog"
          >
            Browse regular prices
          </Link>
        </section>
      )}

      {!signedIn ? (
        <aside className="rounded-lg border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-950">
          <h2 className="font-semibold">More deals may be available after sign-in</h2>
          <p className="mt-2 leading-6">
            Member-only deal metadata is protected by database access policies and is not included
            in this public page response.
          </p>
          <Link
            className="mt-4 inline-flex min-h-11 items-center rounded-md bg-emerald-800 px-4 font-semibold text-white hover:bg-emerald-900"
            href="/sign-in?next=/deals"
          >
            Sign in to view all eligible deals
          </Link>
        </aside>
      ) : null}
    </div>
  );
}
