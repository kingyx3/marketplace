import type { ReactNode } from "react";

import { POLICY_EFFECTIVE_DATE } from "@/lib/policies";

export function PolicyPage({
  title,
  summary,
  children,
}: {
  title: string;
  summary: string;
  children: ReactNode;
}) {
  return (
    <article className="mx-auto max-w-3xl">
      <header className="border-b border-zinc-200 pb-6">
        <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">Policies</p>
        <h1 className="mt-3 text-4xl font-bold tracking-tight text-zinc-950">{title}</h1>
        <p className="mt-4 text-base leading-7 text-zinc-600">{summary}</p>
        <p className="mt-3 text-sm text-zinc-500">Effective {POLICY_EFFECTIVE_DATE}</p>
      </header>
      <div className="policy-content mt-8 space-y-8 text-sm leading-7 text-zinc-700">
        {children}
      </div>
    </article>
  );
}

export function PolicySection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="text-xl font-semibold text-zinc-950">{title}</h2>
      <div className="mt-3 space-y-3">{children}</div>
    </section>
  );
}
