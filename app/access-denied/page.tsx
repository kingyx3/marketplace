import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Access denied",
  robots: { index: false, follow: false },
};

export default function AccessDeniedPage() {
  return (
    <section className="mx-auto max-w-xl rounded-lg border border-amber-200 bg-amber-50 p-8 text-center shadow-sm">
      <p className="text-sm font-semibold uppercase tracking-wide text-amber-800">Access denied</p>
      <h1 className="mt-3 text-3xl font-bold text-zinc-950">This area is for active staff</h1>
      <p className="mt-4 text-sm leading-6 text-zinc-700">
        Your account is signed in, but it does not have permission to open this page.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Link
          href="/account"
          className="inline-flex min-h-11 items-center rounded-md bg-zinc-950 px-5 text-sm font-semibold text-white hover:bg-emerald-700"
        >
          Go to account
        </Link>
        <Link
          href="/catalog"
          className="inline-flex min-h-11 items-center rounded-md border border-zinc-300 bg-white px-5 text-sm font-semibold text-zinc-800 hover:border-zinc-500"
        >
          Browse catalog
        </Link>
      </div>
    </section>
  );
}
