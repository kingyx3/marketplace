import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Sign-in issue",
  robots: { index: false, follow: false },
};

export default async function AuthCodeErrorPage({
  searchParams,
}: {
  searchParams?: Promise<{ next?: string }>;
}) {
  const params = (await searchParams) ?? {};
  const next = safeNextPath(params.next);

  return (
    <section className="mx-auto max-w-lg rounded-xl border border-zinc-200 bg-white p-6 shadow-sm sm:p-8">
      <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Account</p>
      <h1 className="mt-3 text-3xl font-bold tracking-tight text-zinc-950">
        We couldn&apos;t sign you in
      </h1>
      <p className="mt-3 text-sm leading-6 text-zinc-600">
        Your account was not changed. Please try Google sign-in again, or continue browsing and
        return when you&apos;re ready.
      </p>
      <div className="mt-7 grid gap-3 sm:grid-cols-2">
        <Link
          href={`/sign-in?next=${encodeURIComponent(next)}`}
          className="inline-flex min-h-11 items-center justify-center rounded-md bg-zinc-950 px-4 text-sm font-semibold text-white hover:bg-emerald-700"
        >
          Try sign-in again
        </Link>
        <Link
          href="/products"
          className="inline-flex min-h-11 items-center justify-center rounded-md border border-zinc-300 px-4 text-sm font-semibold text-zinc-800 hover:border-zinc-500"
        >
          Continue shopping
        </Link>
      </div>
    </section>
  );
}

function safeNextPath(value: string | undefined): string {
  return value?.startsWith("/") && !value.startsWith("//") ? value : "/account";
}
