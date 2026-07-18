"use client";

import Link from "next/link";
import { useEffect, useId, useState } from "react";

export interface ControlMobileLink {
  href: string;
  label: string;
}

export function ControlMobileNavigation({
  links,
  role,
}: {
  links: ControlMobileLink[];
  role: string;
}) {
  const [open, setOpen] = useState(false);
  const drawerId = useId();

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <>
      <button
        aria-controls={drawerId}
        aria-expanded={open}
        aria-label="Open control sections"
        className="inline-flex min-h-11 items-center gap-2 rounded-md border border-zinc-700 px-3 text-sm font-semibold text-zinc-100 transition hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 lg:hidden"
        onClick={() => setOpen(true)}
        type="button"
      >
        <MenuIcon />
        Sections
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            aria-label="Close control navigation overlay"
            className="absolute inset-0 bg-black/60 backdrop-blur-[1px]"
            onClick={() => setOpen(false)}
            type="button"
          />
          <section
            aria-label="Control navigation drawer"
            className="absolute inset-y-0 right-0 flex w-[min(23rem,calc(100%-2rem))] flex-col border-l border-zinc-800 bg-zinc-950 text-zinc-100 shadow-2xl"
            id={drawerId}
          >
            <div className="flex min-h-16 items-center justify-between gap-3 border-b border-zinc-800 px-4">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-400">Control</p>
                <p className="truncate text-sm font-semibold capitalize text-zinc-200">{role}</p>
              </div>
              <button
                aria-label="Close control navigation"
                className="inline-flex size-11 shrink-0 items-center justify-center rounded-md text-zinc-300 transition hover:bg-zinc-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950"
                onClick={() => setOpen(false)}
                type="button"
              >
                <CloseIcon />
              </button>
            </div>

            <nav aria-label="Mobile control navigation" className="grid gap-1 overflow-y-auto p-3">
              {links.map((link) => (
                <Link
                  className="flex min-h-12 items-center gap-3 rounded-lg px-3 text-sm font-semibold text-zinc-200 transition hover:bg-zinc-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950"
                  href={link.href}
                  key={link.href}
                  onClick={() => setOpen(false)}
                >
                  <SectionIcon />
                  {link.label}
                </Link>
              ))}
            </nav>

            <div className="mt-auto border-t border-zinc-800 p-3">
              <Link
                className="flex min-h-12 items-center gap-3 rounded-lg px-3 text-sm font-medium text-zinc-300 transition hover:bg-zinc-800 hover:text-white"
                href="/"
                onClick={() => setOpen(false)}
              >
                <StorefrontIcon />
                Open storefront
              </Link>
              <form action="/auth/sign-out" method="post">
                <button className="flex min-h-12 w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-medium text-zinc-300 transition hover:bg-zinc-800 hover:text-white">
                  <SignOutIcon />
                  Sign out
                </button>
              </form>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}

const iconClassName = "size-5 shrink-0";

function MenuIcon() {
  return (
    <svg aria-hidden="true" className={iconClassName} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
      <path strokeLinecap="round" d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg aria-hidden="true" className={iconClassName} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
      <path strokeLinecap="round" d="m6 6 12 12M18 6 6 18" />
    </svg>
  );
}

function SectionIcon() {
  return (
    <svg aria-hidden="true" className={iconClassName} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
      <rect x="4" y="4" width="6" height="6" rx="1" />
      <rect x="14" y="4" width="6" height="6" rx="1" />
      <rect x="4" y="14" width="6" height="6" rx="1" />
      <rect x="14" y="14" width="6" height="6" rx="1" />
    </svg>
  );
}

function StorefrontIcon() {
  return (
    <svg aria-hidden="true" className={iconClassName} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 10.5 12 4l8 6.5M6.5 9.5v10h11v-10M9.5 19.5v-5h5v5" />
    </svg>
  );
}

function SignOutIcon() {
  return (
    <svg aria-hidden="true" className={iconClassName} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 5.25H6.75A2.25 2.25 0 0 0 4.5 7.5v9a2.25 2.25 0 0 0 2.25 2.25h3.75" />
      <path strokeLinecap="round" strokeLinejoin="round" d="m14 8 4 4-4 4M9 12h9" />
    </svg>
  );
}
