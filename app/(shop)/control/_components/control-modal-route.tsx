"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, type MouseEvent, type ReactNode } from "react";

export function ControlModalRoute({ children }: { children: ReactNode }) {
  const router = useRouter();
  const closeButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButton.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") router.back();
    };
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [router]);

  function closeFromBackdrop(event: MouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget) router.back();
  }

  return (
    <div
      aria-label="Administrative record"
      aria-modal="true"
      className="fixed inset-0 z-50 grid items-end bg-zinc-950/65 p-0 backdrop-blur-[2px] sm:items-center sm:p-6"
      onMouseDown={closeFromBackdrop}
      role="dialog"
    >
      <div className="relative max-h-[96dvh] w-full overflow-y-auto rounded-t-2xl bg-zinc-50 shadow-2xl sm:mx-auto sm:max-h-[92dvh] sm:max-w-6xl sm:rounded-2xl">
        <div className="sticky top-0 z-10 flex justify-end border-b border-zinc-200 bg-white/95 px-4 py-3 backdrop-blur sm:px-6">
          <button
            aria-label="Close modal"
            className="inline-flex min-h-10 items-center justify-center rounded-md border border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-700 hover:border-emerald-600 hover:text-emerald-700"
            onClick={() => router.back()}
            ref={closeButton}
            type="button"
          >
            Close
          </button>
        </div>
        <div className="p-4 sm:p-6 lg:p-8">{children}</div>
      </div>
    </div>
  );
}
