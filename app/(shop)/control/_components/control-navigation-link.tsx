"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function ControlNavigationLink({ href, label }: { href: string; label: string }) {
  const pathname = usePathname();
  const active =
    href === "/control" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link
      aria-current={active ? "page" : undefined}
      className={`inline-flex min-h-11 items-center rounded-md border-l-2 px-3 py-2 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 ${
        active
          ? "border-emerald-400 bg-zinc-800 text-white"
          : "border-transparent text-zinc-300 hover:bg-zinc-800 hover:text-white"
      }`}
      href={href}
    >
      {label}
    </Link>
  );
}
