import Link from "next/link";

import { StatusBadge } from "@/app/_components/status-badge";
import type { StaffProfile } from "@/lib/admin-staff";
import { hasControlPermission, type ControlPermission } from "@/lib/control-access";

interface WorkflowStep {
  label: string;
  detail: string;
  complete: boolean;
  href: string;
  permission: ControlPermission;
}

export function ProductListingWorkflow({
  productId,
  productComplete,
  pricingComplete,
  supplyComplete,
  listingComplete,
  published,
  staff,
}: {
  productId: string;
  productComplete: boolean;
  pricingComplete: boolean;
  supplyComplete: boolean;
  listingComplete: boolean;
  published: boolean;
  staff: StaffProfile;
}) {
  const steps: WorkflowStep[] = [
    {
      label: "Product",
      detail: "Identity, physical details, taxonomy, media",
      complete: productComplete,
      href: `/control/catalog/products/${productId}`,
      permission: "catalog.view",
    },
    {
      label: "Pricing",
      detail: "Base and comparison price",
      complete: pricingComplete,
      href: `/control/pricing?product=${productId}`,
      permission: "pricing.view",
    },
    {
      label: "Supply",
      detail: "Inventory or incoming stock",
      complete: supplyComplete,
      href: `/control/supply?product=${productId}`,
      permission: "supply.view",
    },
    {
      label: "Availability & listing",
      detail: "Selling mode, dates, content",
      complete: listingComplete,
      href: `/control/storefront/listings/${productId}`,
      permission: "storefront.view",
    },
    {
      label: "Readiness review",
      detail: "Product, price, supply, listing",
      complete:
        productComplete && pricingComplete && supplyComplete && listingComplete,
      href: `/control/storefront/listings/${productId}`,
      permission: "storefront.view",
    },
    {
      label: "Publish",
      detail: "Final customer-facing approval",
      complete: published,
      href: `/control/storefront/listings/${productId}`,
      permission: "storefront.view",
    },
  ];
  const completeCount = steps.filter((step) => step.complete).length;

  return (
    <section className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-5 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.14em] text-emerald-700">
            Listing workflow
          </p>
          <h2 className="mt-1 text-xl font-semibold text-zinc-950">
            Product-to-storefront readiness
          </h2>
          <p className="mt-1 text-sm text-zinc-600">
            Continue through each owning domain without mixing its mutation authority into Catalog.
          </p>
        </div>
        <StatusBadge tone={completeCount === steps.length ? "success" : "warning"}>
          {completeCount} of {steps.length} complete
        </StatusBadge>
      </div>
      <ol className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {steps.map((step, index) => {
          const content = (
            <>
              <span
                className={`flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${step.complete ? "bg-emerald-700 text-white" : "bg-zinc-200 text-zinc-700"}`}
              >
                {step.complete ? "✓" : index + 1}
              </span>
              <span>
                <span className="block text-sm font-semibold text-zinc-950">{step.label}</span>
                <span className="mt-0.5 block text-xs leading-5 text-zinc-600">{step.detail}</span>
              </span>
            </>
          );
          return (
            <li key={step.label}>
              {hasControlPermission(staff, step.permission) ? (
                <Link
                  className="flex min-h-16 gap-3 rounded-lg border border-emerald-100 bg-white p-3 transition hover:border-emerald-500"
                  href={step.href}
                >
                  {content}
                </Link>
              ) : (
                <div
                  className="flex min-h-16 gap-3 rounded-lg border border-zinc-200 bg-zinc-100/70 p-3 opacity-75"
                  title="Another administrator domain owns this step"
                >
                  {content}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
