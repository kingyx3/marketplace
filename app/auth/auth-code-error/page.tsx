import Link from "next/link";

export default function AuthCodeErrorPage() {
  return (
    <section className="mx-auto max-w-xl space-y-4 rounded-md border border-red-200 bg-red-50 p-6">
      <p className="text-sm font-semibold uppercase tracking-wide text-red-700">Sign-in failed</p>
      <h1 className="text-2xl font-semibold tracking-tight text-red-950">
        We could not complete Google sign-in.
      </h1>
      <p className="text-sm leading-6 text-red-900">
        Try again. If this keeps happening, check the Supabase Google provider redirect URL
        for this environment.
      </p>
      <Link
        href="/auth/sign-in"
        className="inline-flex rounded-md bg-red-950 px-4 py-2 text-sm font-medium text-white"
      >
        Try again
      </Link>
    </section>
  );
}
