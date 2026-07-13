import type { Metadata } from "next";
import Link from "next/link";

import { SentryUserContext } from "@/app/sentry-user-context";
import { getAppName } from "@/lib/app-config";
import { getCurrentUser } from "@/lib/auth";

import "./globals.css";

const appName = getAppName();

export const metadata: Metadata = {
  title: `${appName} | TCG Booster Boxes`,
  description:
    "Sealed TCG booster boxes for players, collectors, and retailers. B2C, wholesale, and pre-orders.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  const appName = getAppName();

  return (
    <html lang="en">
      <body className="min-h-screen bg-zinc-50 text-zinc-900 antialiased">
        <SentryUserContext userId={user?.id} />
        <header className="sticky top-0 z-40 border-b border-zinc-200 bg-white/95 backdrop-blur">
          <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
            <Link href="/" className="text-lg font-semibold text-zinc-950">
              {appName}
            </Link>
            <nav className="flex flex-wrap gap-x-5 gap-y-2 text-sm font-medium text-zinc-600">
              <Link href="/" className="hover:text-zinc-950">
                Home
              </Link>
              <Link href="/catalog" className="hover:text-zinc-950">
                Catalog
              </Link>
              <Link href="/preorders" className="hover:text-zinc-950">
                Preorders
              </Link>
              <Link href="/wholesale" className="hover:text-zinc-950">
                Wholesale
              </Link>
              <Link href="/admin" className="hover:text-zinc-950">
                Admin
              </Link>
              <Link
                href="/cart"
                className="rounded-full bg-zinc-950 px-3 py-1 text-white hover:bg-emerald-700"
              >
                Cart
              </Link>
              {user ? (
                <>
                  <Link href="/account" className="text-zinc-950 hover:text-emerald-700">
                    Account
                  </Link>
                  <form action="/auth/sign-out" method="post">
                    <button type="submit" className="hover:text-zinc-950">
                      Sign out
                    </button>
                  </form>
                </>
              ) : (
                <Link href="/auth/sign-in" className="text-zinc-950 hover:text-emerald-700">
                  Sign in
                </Link>
              )}
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:py-10">{children}</main>
      </body>
    </html>
  );
}
