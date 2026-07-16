import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false, follow: false },
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams?: Promise<{ next?: string }>;
}) {
  const params = (await searchParams) ?? {};
  const next = safeNextPath(params.next);

  return (
    <section className="mx-auto max-w-md rounded-lg border border-zinc-200 bg-white p-8 shadow-sm">
      <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">Account</p>
      <h1 className="mt-3 text-3xl font-bold text-zinc-950">Sign in securely</h1>
      <p className="mt-4 text-sm leading-6 text-zinc-600">
        Continue with Google to access orders, preorders, complete eligible deals, and approved
        wholesale pricing.
      </p>
      <a
        className="mt-6 inline-flex min-h-11 w-full items-center justify-center rounded-md bg-zinc-950 px-5 text-sm font-semibold text-white hover:bg-emerald-700"
        href={`/auth/sign-in?next=${encodeURIComponent(next)}`}
      >
        Continue with Google
      </a>
      <p className="mt-5 text-xs leading-5 text-zinc-500">
        By continuing, you acknowledge our{" "}
        <Link className="font-semibold text-zinc-700 underline" href="/terms">
          Terms
        </Link>{" "}
        and confirm that you have read our{" "}
        <Link className="font-semibold text-zinc-700 underline" href="/privacy">
          Privacy Policy
        </Link>
        .
      </p>
    </section>
  );
}

function safeNextPath(value: string | undefined): string {
  return value?.startsWith("/") && !value.startsWith("//") ? value : "/account";
}
