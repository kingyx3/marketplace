import Link from "next/link";

import { CookiePreferences } from "@/app/_components/cookie-preferences";

const policyLinks = [
  ["Privacy", "/privacy"],
  ["Terms", "/terms"],
  ["Cookies", "/cookies"],
  ["Returns & refunds", "/returns"],
  ["Shipping", "/shipping"],
  ["Accessibility", "/accessibility"],
  ["Contact", "/contact"],
] as const;

export function SiteFooter({ appName }: { appName: string }) {
  return (
    <footer className="border-t border-zinc-200 bg-white">
      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-8 sm:px-6 lg:grid-cols-[1fr_auto] lg:items-end">
        <div>
          <p className="font-semibold text-zinc-950">{appName}</p>
          <p className="mt-2 max-w-xl text-sm leading-6 text-zinc-600">
            Sealed trading card products with transparent pricing, allocation, and order status.
          </p>
          <p className="mt-3 text-xs text-zinc-500">
            © {new Date().getUTCFullYear()} {appName}. All rights reserved.
          </p>
        </div>
        <div className="grid gap-3 lg:justify-items-end">
          <nav
            aria-label="Policies"
            className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-zinc-600"
          >
            {policyLinks.map(([label, href]) => (
              <Link key={href} href={href} className="hover:text-zinc-950">
                {label}
              </Link>
            ))}
          </nav>
          <CookiePreferences />
        </div>
      </div>
    </footer>
  );
}
