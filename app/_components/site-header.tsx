import Link from "next/link";

import type { CurrentViewer } from "@/lib/auth";

const baseLinkClass =
  "inline-flex min-h-11 shrink-0 items-center justify-center rounded-md px-3 text-sm font-medium transition hover:bg-zinc-100 hover:text-zinc-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2";

export function SiteHeader({ appName, viewer }: { appName: string; viewer: CurrentViewer }) {
  const signedIn = Boolean(viewer.user);

  return (
    <header className="sticky top-0 z-40 border-b border-zinc-200 bg-white/95 backdrop-blur">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="flex min-h-16 items-center justify-between gap-3">
          <Link
            href="/"
            className="min-w-0 truncate text-lg font-semibold text-zinc-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2"
          >
            {appName}
          </Link>

          <nav
            aria-label="Primary navigation"
            className="hidden items-center gap-1 text-zinc-600 lg:flex"
          >
            <PrimaryLinks signedIn={signedIn} />
            <AccountActions signedIn={signedIn} />
          </nav>

          <div className="flex shrink-0 items-center gap-2 lg:hidden">
            <Link
              href="/cart"
              className="inline-flex min-h-11 items-center justify-center rounded-md bg-zinc-950 px-3 text-sm font-semibold text-white transition hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2"
            >
              Cart
            </Link>
            <Link
              href={signedIn ? "/account" : "/sign-in"}
              className="inline-flex min-h-11 items-center justify-center rounded-md border border-zinc-300 px-3 text-sm font-semibold text-zinc-800 transition hover:border-zinc-500 hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2"
            >
              {signedIn ? "Account" : "Sign in"}
            </Link>
          </div>
        </div>

        <nav
          aria-label="Mobile primary navigation"
          className="-mx-4 flex snap-x gap-1 overflow-x-auto px-4 pb-3 text-zinc-600 sm:-mx-6 sm:px-6 lg:hidden"
        >
          <PrimaryLinks signedIn={signedIn} />
          {signedIn ? (
            <form action="/auth/sign-out" method="post" className="shrink-0 snap-start">
              <button type="submit" className={baseLinkClass}>
                Sign out
              </button>
            </form>
          ) : null}
        </nav>
      </div>
    </header>
  );
}

function PrimaryLinks({ signedIn }: { signedIn: boolean }) {
  return (
    <>
      <Link href="/" className={`${baseLinkClass} snap-start`}>
        Home
      </Link>
      <Link href="/catalog" className={`${baseLinkClass} snap-start`}>
        Catalog
      </Link>
      {signedIn ? (
        <>
          <Link href="/preorders" className={`${baseLinkClass} snap-start`}>
            Preorders
          </Link>
          <Link href="/orders" className={`${baseLinkClass} snap-start`}>
            Orders
          </Link>
        </>
      ) : null}
    </>
  );
}

function AccountActions({ signedIn }: { signedIn: boolean }) {
  return signedIn ? (
    <>
      <Link href="/account" className={baseLinkClass}>
        Account
      </Link>
      <form action="/auth/sign-out" method="post">
        <button type="submit" className={baseLinkClass}>
          Sign out
        </button>
      </form>
      <Link
        href="/cart"
        className="inline-flex min-h-11 items-center justify-center rounded-md bg-zinc-950 px-4 text-sm font-semibold text-white transition hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2"
      >
        Cart
      </Link>
    </>
  ) : (
    <>
      <Link href="/sign-in" className={baseLinkClass}>
        Sign in
      </Link>
      <Link
        href="/cart"
        className="inline-flex min-h-11 items-center justify-center rounded-md bg-zinc-950 px-4 text-sm font-semibold text-white transition hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2"
      >
        Cart
      </Link>
    </>
  );
}
