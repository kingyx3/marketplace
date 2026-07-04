import type { ReactNode } from "react";

export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <section className="grid gap-5 border-b border-zinc-200 pb-8 md:grid-cols-[1fr_auto] md:items-end">
      <div className="max-w-3xl">
        {eyebrow ? (
          <p className="mb-3 text-xs font-semibold uppercase text-emerald-700">{eyebrow}</p>
        ) : null}
        <h1 className="text-3xl font-bold text-zinc-950 md:text-4xl">{title}</h1>
        {description ? <p className="mt-4 text-base leading-7 text-zinc-600">{description}</p> : null}
      </div>
      {action ? <div className="flex flex-wrap gap-3 md:justify-end">{action}</div> : null}
    </section>
  );
}
