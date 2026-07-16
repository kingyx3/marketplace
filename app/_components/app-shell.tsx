"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { SiteFooter } from "@/app/_components/site-footer";
import { SiteHeader } from "@/app/_components/site-header";
import type { CurrentViewer } from "@/lib/auth";

export function AppShell({
  appName,
  children,
  viewer,
}: {
  appName: string;
  children: ReactNode;
  viewer: CurrentViewer;
}) {
  const pathname = usePathname();
  const isControl = pathname === "/control" || pathname.startsWith("/control/");

  if (isControl) {
    return <main className="min-h-screen min-w-0 bg-zinc-100 text-zinc-950">{children}</main>;
  }

  return (
    <>
      <SiteHeader appName={appName} viewer={viewer} />
      <main className="mx-auto w-full min-w-0 max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:py-10">
        {children}
      </main>
      <SiteFooter appName={appName} />
    </>
  );
}
