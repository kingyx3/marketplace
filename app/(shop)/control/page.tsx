import Link from "next/link";

import { MetricCard } from "@/app/_components/metric-card";
import { PageHeader } from "@/app/_components/page-header";
import { StatusBadge } from "@/app/_components/status-badge";
import {
  hasControlPermission,
  requireControlPermission,
  type ControlPermission,
} from "@/lib/control-access";
import { CONTROL_PERMISSION_DEFINITIONS } from "@/lib/control-permissions";

export const dynamic = "force-dynamic";

const workspaces: Array<{
  href: string;
  label: string;
  detail: string;
  permissions: ControlPermission[];
}> = [
  {
    href: "/control/catalog",
    label: "Catalog",
    detail: "Product identity, taxonomy, media, and physical SKU definitions.",
    permissions: ["catalog.view"],
  },
  {
    href: "/control/pricing",
    label: "Pricing",
    detail: "Versioned base prices, comparison prices, and promotions.",
    permissions: ["pricing.view"],
  },
  {
    href: "/control/storefront",
    label: "Storefront",
    detail: "Availability, listing content, merchandising, review, and publication.",
    permissions: ["storefront.view"],
  },
  {
    href: "/control/supply",
    label: "Supply",
    detail: "Inventory, incoming stock, suppliers, and purchase orders.",
    permissions: ["supply.view"],
  },
  {
    href: "/control/orders",
    label: "Orders",
    detail: "Normal orders, preorders, lifecycle actions, and allocations.",
    permissions: ["orders.view"],
  },
  {
    href: "/control/fulfilment",
    label: "Fulfilment",
    detail: "Packing, shipment arrangement, tracking, and delivery exceptions.",
    permissions: ["fulfilment.view"],
  },
  {
    href: "/control/customers",
    label: "Customers",
    detail: "Customer context, account lifecycle, and communications.",
    permissions: ["customers.view"],
  },
  {
    href: "/control/finance",
    label: "Finance",
    detail: "Payment exceptions, refunds, and audited reconciliation.",
    permissions: ["finance.view"],
  },
  {
    href: "/control/governance",
    label: "Governance",
    detail: "Administrator coverage and immutable audit evidence.",
    permissions: ["governance.view", "audit.view"],
  },
];

export default async function ControlOverviewPage() {
  const { staff } = await requireControlPermission("control.view", "/control");
  const visibleWorkspaces = workspaces.filter((workspace) =>
    workspace.permissions.some((permission) => hasControlPermission(staff, permission))
  );
  const permissionCount = CONTROL_PERMISSION_DEFINITIONS.filter((permission) =>
    hasControlPermission(staff, permission.key)
  ).length;
  const sensitiveCount = CONTROL_PERMISSION_DEFINITIONS.filter(
    (permission) =>
      "highRisk" in permission && permission.highRisk && hasControlPermission(staff, permission.key)
  ).length;

  return (
    <div className="space-y-8">
      <PageHeader
        action={<StatusBadge tone="success">{staff.role} template</StatusBadge>}
        description="Open the owning control centre for the task at hand. Each workspace keeps product, price, publication, supply, order, fulfilment, finance, and access authority separate."
        eyebrow="Control"
        title="Administrative overview"
      />

      <section className="grid gap-4 sm:grid-cols-3">
        <MetricCard
          label="Assigned workspaces"
          value={String(visibleWorkspaces.length)}
          detail="Visible navigation domains"
        />
        <MetricCard
          label="Granted actions"
          value={String(permissionCount)}
          detail="Explicit action coverage"
        />
        <MetricCard
          label="Sensitive actions"
          value={String(sensitiveCount)}
          detail="High-impact authority"
        />
      </section>

      <section>
        <div>
          <h2 className="text-lg font-semibold text-zinc-950">Your control centres</h2>
          <p className="mt-1 text-sm text-zinc-600">
            Only workspaces covered by your active grant appear here and in navigation.
          </p>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visibleWorkspaces.map((workspace) => (
            <Link
              className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm transition hover:border-emerald-500 hover:shadow-md"
              href={workspace.href}
              key={workspace.href}
            >
              <h3 className="font-semibold text-zinc-950">{workspace.label}</h3>
              <p className="mt-2 text-sm leading-6 text-zinc-600">{workspace.detail}</p>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
