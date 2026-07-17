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
    <section className="grid min-w-0 gap-4 border-b border-zinc-200 pb-6 sm:gap-5 sm:pb-8 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
      <div className="min-w-0 max-w-3xl">
        {eyebrow ? (
          <p className="mb-2 text-xs font-semibold uppercase text-emerald-700 sm:mb-3">{eyebrow}</p>
        ) : null}
        <h1 className="break-words text-2xl font-bold text-zinc-950 sm:text-3xl md:text-4xl">
          {title}
        </h1>
        {description ? (
          <p className="mt-3 text-sm leading-6 text-zinc-600 sm:mt-4 sm:text-base sm:leading-7">
            {description}
          </p>
        ) : null}
      </div>
      {action ? (
        <div className="grid w-full grid-cols-1 gap-3 sm:flex sm:w-auto sm:flex-wrap md:justify-end [&>*]:w-full sm:[&>*]:w-auto">
          {action}
        </div>
      ) : null}
    </section>
  );
}
