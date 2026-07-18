"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

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
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;

    const previousBodyOverflow = document.body.style.overflow;
    const previousDocumentOverflow = document.documentElement.style.overflow;
    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : menuButtonRef.current;

    const closeOnKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        return;
      }

      if (event.key !== "Tab") return;

      const focusableElements = Array.from(
        drawerRef.current?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
        ) ?? []
      );
      const firstFocusable = focusableElements.at(0);
      const lastFocusable = focusableElements.at(-1);

      if (!firstFocusable || !lastFocusable) {
        event.preventDefault();
        drawerRef.current?.focus();
        return;
      }

      if (event.shiftKey && document.activeElement === firstFocusable) {
        event.preventDefault();
        lastFocusable.focus();
      } else if (!event.shiftKey && document.activeElement === lastFocusable) {
        event.preventDefault();
        firstFocusable.focus();
      }
    };

    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnKeyDown);
    const focusFrame = window.requestAnimationFrame(() => closeButtonRef.current?.focus());

    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousDocumentOverflow;
      window.removeEventListener("keydown", closeOnKeyDown);
      window.requestAnimationFrame(() => {
        if (previouslyFocused?.isConnected) {
          previouslyFocused.focus();
        } else {
          menuButtonRef.current?.focus();
        }
      });
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
        ref={menuButtonRef}
        type="button"
      >
        <MenuIcon />
        Sections
      </button>

      {open
        ? createPortal(
            <div className="fixed inset-0 z-[100] isolate lg:hidden">
              <button
                aria-label="Close control navigation overlay"
                className="absolute inset-0 cursor-default bg-black/80 backdrop-blur-sm"
                onClick={() => setOpen(false)}
                type="button"
              />
              <section
                aria-labelledby={`${drawerId}-title`}
                aria-modal="true"
                className="absolute inset-y-0 right-0 flex h-dvh w-[min(23rem,calc(100%-2rem))] flex-col overflow-hidden border-l border-zinc-800 bg-zinc-950 text-zinc-100 shadow-2xl"
                id={drawerId}
                ref={drawerRef}
                role="dialog"
                tabIndex={-1}
              >
                <div className="flex min-h-16 items-center justify-between gap-3 border-b border-zinc-800 px-4 pt-[env(safe-area-inset-top)]">
                  <div className="min-w-0" id={`${drawerId}-title`}>
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-400">
                      Control
                    </p>
                    <p className="truncate text-sm font-semibold capitalize text-zinc-200">{role}</p>
                  </div>
                  <button
                    aria-label="Close control navigation"
                    className="inline-flex size-11 shrink-0 items-center justify-center rounded-md text-zinc-300 transition hover:bg-zinc-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950"
                    onClick={() => setOpen(false)}
                    ref={closeButtonRef}
                    type="button"
                  >
                    <CloseIcon />
                  </button>
                </div>

                <nav
                  aria-label="Mobile control navigation"
                  className="grid gap-1 overflow-y-auto overscroll-contain p-3"
                >
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

                <div className="mt-auto border-t border-zinc-800 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                  <Link
                    className="flex min-h-12 items-center gap-3 rounded-lg px-3 text-sm font-medium text-zinc-300 transition hover:bg-zinc-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950"
                    href="/"
                    onClick={() => setOpen(false)}
                  >
                    <StorefrontIcon />
                    Open storefront
                  </Link>
                  <form action="/auth/sign-out" method="post">
                    <button className="flex min-h-12 w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-medium text-zinc-300 transition hover:bg-zinc-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950">
                      <SignOutIcon />
                      Sign out
                    </button>
                  </form>
                </div>
              </section>
            </div>,
            document.body
          )
        : null}
    </>
  );
}

const iconClassName = "size-5 shrink-0";

function MenuIcon() {
  return (
    <svg
      aria-hidden="true"
      className={iconClassName}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <path strokeLinecap="round" d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      aria-hidden="true"
      className={iconClassName}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <path strokeLinecap="round" d="m6 6 12 12M18 6 6 18" />
    </svg>
  );
}

function SectionIcon() {
  return (
    <svg
      aria-hidden="true"
      className={iconClassName}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <rect x="4" y="4" width="6" height="6" rx="1" />
      <rect x="14" y="4" width="6" height="6" rx="1" />
      <rect x="4" y="14" width="6" height="6" rx="1" />
      <rect x="14" y="14" width="6" height="6" rx="1" />
    </svg>
  );
}

function StorefrontIcon() {
  return (
    <svg
      aria-hidden="true"
      className={iconClassName}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 10.5 12 4l8 6.5M6.5 9.5v10h11v-10M9.5 19.5v-5h5v5" />
    </svg>
  );
}

function SignOutIcon() {
  return (
    <svg
      aria-hidden="true"
      className={iconClassName}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 5.25H6.75A2.25 2.25 0 0 0 4.5 7.5v9a2.25 2.25 0 0 0 2.25 2.25h3.75" />
      <path strokeLinecap="round" strokeLinejoin="round" d="m14 8 4 4-4 4M9 12h9" />
    </svg>
  );
}
