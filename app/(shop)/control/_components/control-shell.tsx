import Link from "next/link";
import type { ReactNode } from "react";

import { hasControlPermission, type ControlPermission } from "@/lib/control-access";
import type { StaffProfile } from "@/lib/admin-staff";

const links: Array<{ href: string; label: string; permission: ControlPermission }> = [
  { href: "/control", label: "Overview", permission: "view_control" },
  { href: "/control/operations", label: "Operations", permission: "manage_full_operations" },
  { href: "/control/suppliers", label: "Suppliers", permission: "manage_suppliers" },
  { href: "/control/categories", label: "Categories", permission: "manage_catalog" },
  { href: "/control/sets", label: "Sets", permission: "manage_catalog" },
  { href: "/control/listings", label: "Listings", permission: "manage_catalog" },
  { href: "/control/deals", label: "Deals", permission: "manage_catalog" },
  { href: "/control/administrators", label: "Administrators", permission: "manage_admins" },
  { href: "/control/audit", label: "Audit log", permission: "view_audit" },
];

export function ControlShell({
  children,
  staff,
}: {
  children: ReactNode;
  staff: StaffProfile;
}) {
  const visibleLinks = links.filter((link) => hasControlPermission(staff, link.permission));

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[17rem_minmax(0,1fr)]">
      <aside className="border-b border-zinc-800 bg-zinc-950 text-zinc-100 lg:min-h-screen lg:border-b-0 lg:border-r">
        <div className="flex items-center justify-between gap-4 px-5 py-5 lg:block">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-400">
              Control
            </p>
            <p className="mt-1 text-lg font-semibold">Operations console</p>
          </div>
          <span className="rounded-full border border-zinc-700 px-2.5 py-1 text-xs font-medium capitalize text-zinc-300">
            {staff.role}
          </span>
        </div>

        <nav aria-label="Control navigation" className="flex gap-2 overflow-x-auto px-3 pb-4 lg:grid lg:px-4">
          {visibleLinks.map((link) => (
            <Link
              key={link.href}
              className="whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium text-zinc-300 hover:bg-zinc-800 hover:text-white"
              href={link.href}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="hidden border-t border-zinc-800 p-4 lg:block">
          <Link className="block rounded-md px-3 py-2 text-sm text-zinc-400 hover:text-white" href="/">
            Open storefront
          </Link>
          <form action="/auth/sign-out" method="post">
            <button className="w-full rounded-md px-3 py-2 text-left text-sm text-zinc-400 hover:text-white">
              Sign out
            </button>
          </form>
        </div>
      </aside>

      <div className="min-w-0">
        <header className="border-b border-zinc-200 bg-white px-5 py-4 lg:px-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-zinc-950">Administrative workspace</p>
              <p className="text-xs text-zinc-500">Server-authorized and audited</p>
            </div>
            <div className="flex items-center gap-4 lg:hidden">
              <Link className="text-sm font-medium text-zinc-600" href="/">
                Storefront
              </Link>
              <form action="/auth/sign-out" method="post">
                <button className="text-sm font-medium text-zinc-600">Sign out</button>
              </form>
            </div>
          </div>
        </header>
        <div className="mx-auto max-w-[96rem] p-5 lg:p-8">{children}</div>
      </div>
    </div>
  );
}
