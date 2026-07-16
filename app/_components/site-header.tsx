import Link from "next/link";

import type { CurrentViewer } from "@/lib/auth";

export function SiteHeader({ appName, viewer }: { appName: string; viewer: CurrentViewer }) {
  const signedIn = Boolean(viewer.user);
  const isStaff = Boolean(viewer.staff);

  return (
    <header className="sticky top-0 z-40 border-b border-zinc-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
        <Link href="/" className="text-lg font-semibold text-zinc-950">
          {appName}
        </Link>
        <nav
          aria-label="Primary navigation"
          className="flex flex-wrap items-center gap-x-5 gap-y-3 text-sm font-medium text-zinc-600"
        >
          <Link href="/" className="hover:text-zinc-950">
            Home
          </Link>
          <Link href="/catalog" className="hover:text-zinc-950">
            Catalog
          </Link>
          {signedIn ? (
            <>
              <Link href="/preorders" className="hover:text-zinc-950">
                Preorders
              </Link>
              <Link href="/orders" className="hover:text-zinc-950">
                Orders
              </Link>
            </>
          ) : null}
          {isStaff ? (
            <Link href="/admin" className="hover:text-zinc-950">
              Admin
            </Link>
          ) : null}
          <Link
            href="/cart"
            className="rounded-full bg-zinc-950 px-3 py-1.5 text-white hover:bg-emerald-700"
          >
            Cart
          </Link>
          {signedIn ? (
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
            <Link href="/sign-in" className="text-zinc-950 hover:text-emerald-700">
              Sign in
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
