"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import type { CurrentViewer } from "@/lib/auth";

const baseLinkClass =
  "inline-flex min-h-11 shrink-0 items-center justify-center rounded-md px-3 text-sm font-medium transition hover:bg-zinc-100 hover:text-zinc-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2";

export function SiteHeader({ appName, viewer }: { appName: string; viewer: CurrentViewer }) {
  const signedIn = Boolean(viewer.user);
  const [mobileOpen, setMobileOpen] = useState(false);
  const drawerId = useId();
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const brandInitial = appName.trim().charAt(0).toUpperCase() || "S";

  useEffect(() => {
    if (!mobileOpen) return;

    const previousBodyOverflow = document.body.style.overflow;
    const previousDocumentOverflow = document.documentElement.style.overflow;
    const previouslyFocused =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : menuButtonRef.current;

    const closeOnKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setMobileOpen(false);
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
    const menuButton = menuButtonRef.current;

    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousDocumentOverflow;
      window.removeEventListener("keydown", closeOnKeyDown);
      window.requestAnimationFrame(() => {
        if (previouslyFocused?.isConnected) {
          previouslyFocused.focus();
        } else {
          menuButton?.focus();
        }
      });
    };
  }, [mobileOpen]);

  return (
    <header className="sticky top-0 z-40 border-b border-zinc-200 bg-white/95 backdrop-blur">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="flex min-h-16 items-center justify-between gap-3">
          <Link
            aria-label={`${appName} home`}
            href="/"
            className="inline-flex min-w-0 items-center gap-2 rounded-md text-zinc-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2"
          >
            <span
              aria-hidden="true"
              className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-zinc-950 text-sm font-bold text-white"
            >
              {brandInitial}
            </span>
            <span className="hidden max-w-48 truncate text-lg font-semibold min-[360px]:inline">
              {appName}
            </span>
          </Link>

          <nav
            aria-label="Primary navigation"
            className="hidden items-center gap-1 text-zinc-600 lg:flex"
          >
            <PrimaryLinks signedIn={signedIn} />
            <AccountActions signedIn={signedIn} />
          </nav>

          <div className="flex shrink-0 items-center gap-1 lg:hidden">
            <Link
              aria-label="Cart"
              href="/cart"
              className="inline-flex size-11 items-center justify-center rounded-md text-zinc-700 transition hover:bg-zinc-100 hover:text-zinc-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2"
            >
              <CartIcon />
            </Link>
            <button
              aria-controls={drawerId}
              aria-expanded={mobileOpen}
              aria-label="Open navigation"
              className="inline-flex size-11 items-center justify-center rounded-md text-zinc-700 transition hover:bg-zinc-100 hover:text-zinc-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2"
              onClick={() => setMobileOpen(true)}
              ref={menuButtonRef}
              type="button"
            >
              <MenuIcon />
            </button>
          </div>
        </div>
      </div>

      {mobileOpen
        ? createPortal(
            <div className="fixed inset-0 z-[100] isolate lg:hidden">
              <button
                aria-label="Close navigation overlay"
                className="absolute inset-0 cursor-default bg-zinc-950/80 backdrop-blur-sm"
                onClick={() => setMobileOpen(false)}
                type="button"
              />
              <section
                aria-labelledby={`${drawerId}-title`}
                aria-modal="true"
                className="absolute inset-y-0 right-0 flex h-dvh w-[min(22rem,calc(100%-2rem))] flex-col overflow-hidden border-l border-zinc-200 bg-white text-zinc-950 shadow-2xl"
                id={drawerId}
                ref={drawerRef}
                role="dialog"
                tabIndex={-1}
              >
                <div className="flex min-h-16 items-center justify-between gap-3 border-b border-zinc-200 px-4 pt-[env(safe-area-inset-top)]">
                  <div className="flex min-w-0 items-center gap-2">
                    <span
                      aria-hidden="true"
                      className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-zinc-950 text-sm font-bold text-white"
                    >
                      {brandInitial}
                    </span>
                    <span className="truncate font-semibold text-zinc-950" id={`${drawerId}-title`}>
                      {appName}
                    </span>
                  </div>
                  <button
                    aria-label="Close navigation"
                    className="inline-flex size-11 shrink-0 items-center justify-center rounded-md text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2"
                    onClick={() => setMobileOpen(false)}
                    ref={closeButtonRef}
                    type="button"
                  >
                    <CloseIcon />
                  </button>
                </div>

                <nav
                  aria-label="Mobile primary navigation"
                  className="grid gap-1 overflow-y-auto overscroll-contain p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
                >
                  <MobileLink
                    href="/products"
                    icon={<ProductsIcon />}
                    onClick={() => setMobileOpen(false)}
                  >
                    Products
                  </MobileLink>
                  {signedIn ? (
                    <>
                      <MobileLink
                        href="/orders"
                        icon={<OrdersIcon />}
                        onClick={() => setMobileOpen(false)}
                      >
                        Orders
                      </MobileLink>
                      <MobileLink
                        href="/account"
                        icon={<AccountIcon />}
                        onClick={() => setMobileOpen(false)}
                      >
                        Account
                      </MobileLink>
                    </>
                  ) : (
                    <MobileLink
                      href="/sign-in"
                      icon={<SignInIcon />}
                      onClick={() => setMobileOpen(false)}
                    >
                      Sign in
                    </MobileLink>
                  )}
                </nav>
              </section>
            </div>,
            document.body
          )
        : null}
    </header>
  );
}

function PrimaryLinks({ signedIn }: { signedIn: boolean }) {
  return (
    <>
      <Link href="/products" className={baseLinkClass}>
        Products
      </Link>
      {signedIn ? (
        <Link href="/orders" className={baseLinkClass}>
          Orders
        </Link>
      ) : null}
    </>
  );
}

function AccountActions({ signedIn }: { signedIn: boolean }) {
  return signedIn ? (
    <>
      <Link href="/account" className={baseLinkClass}>
        Account
      </Link>
      <Link
        href="/cart"
        className="inline-flex min-h-11 items-center justify-center rounded-md bg-zinc-950 px-4 text-sm font-semibold text-white transition hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2"
      >
        Cart
      </Link>
    </>
  ) : (
    <>
      <Link href="/sign-in" className={baseLinkClass}>
        Sign in
      </Link>
      <Link
        href="/cart"
        className="inline-flex min-h-11 items-center justify-center rounded-md bg-zinc-950 px-4 text-sm font-semibold text-white transition hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2"
      >
        Cart
      </Link>
    </>
  );
}

function MobileLink({
  children,
  href,
  icon,
  onClick,
}: {
  children: ReactNode;
  href: string;
  icon: ReactNode;
  onClick: () => void;
}) {
  return (
    <Link
      className="flex min-h-12 items-center gap-3 rounded-lg px-3 text-sm font-semibold text-zinc-800 transition hover:bg-zinc-100 hover:text-zinc-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2"
      href={href}
      onClick={onClick}
    >
      <span
        aria-hidden="true"
        className="inline-flex size-6 items-center justify-center text-zinc-500"
      >
        {icon}
      </span>
      {children}
    </Link>
  );
}

const iconClassName = "size-5";

function CartIcon() {
  return (
    <svg
      aria-hidden="true"
      className={iconClassName}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 5.25h1.5l1.5 9h10.5l1.5-6.75H6" />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 18.75h.008v.008H9v-.008Zm7.5 0h.008v.008H16.5v-.008Z"
      />
    </svg>
  );
}

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

function ProductsIcon() {
  return (
    <svg
      aria-hidden="true"
      className={iconClassName}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="m4.5 7.5 7.5-4 7.5 4v9L12 20.5l-7.5-4v-9Z"
      />
      <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 7.5 7.5 4 7.5-4M12 11.5v9" />
    </svg>
  );
}

function OrdersIcon() {
  return (
    <svg
      aria-hidden="true"
      className={iconClassName}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M7 3.75h10v16.5l-2.5-1.5-2.5 1.5-2.5-1.5-2.5 1.5V3.75Z"
      />
      <path strokeLinecap="round" d="M9 8h6M9 12h6M9 16h3" />
    </svg>
  );
}

function AccountIcon() {
  return (
    <svg
      aria-hidden="true"
      className={iconClassName}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <circle cx="12" cy="8.25" r="3.25" />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M5.75 19.5c.75-3.5 2.85-5.25 6.25-5.25s5.5 1.75 6.25 5.25"
      />
    </svg>
  );
}

function SignInIcon() {
  return (
    <svg
      aria-hidden="true"
      className={iconClassName}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M13.5 5.25H7.25A2.25 2.25 0 0 0 5 7.5v9A2.25 2.25 0 0 0 7.25 18.75h6.25"
      />
      <path strokeLinecap="round" strokeLinejoin="round" d="m13 8 4 4-4 4M9 12h8" />
    </svg>
  );
}
