"use client";

import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";

import { ControlConfirmDialog } from "@/app/(shop)/control/_components/control-confirm-dialog";

export function ControlModalRoute({ children }: { children: ReactNode }) {
  const router = useRouter();
  const closeButton = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const closing = useRef(false);
  const historyGuardAdded = useRef(false);
  const historyGuardId = useId();
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const hasUnsavedChanges = useCallback(
    () => Boolean(dialog.current?.querySelector('form[data-admin-form="true"][data-dirty="true"]')),
    []
  );

  const closeModal = useCallback(() => {
    closing.current = true;
    if (historyGuardAdded.current) {
      window.history.go(-2);
      return;
    }
    router.back();
  }, [router]);

  const requestClose = useCallback(() => {
    if (hasUnsavedChanges()) {
      setConfirmDiscard(true);
      return;
    }
    closeModal();
  }, [closeModal, hasUnsavedChanges]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const guardKey = `control-modal-${historyGuardId}`;
    if (window.history.state?.__controlModalGuard !== guardKey) {
      window.history.pushState(
        { ...window.history.state, __controlModalGuard: guardKey },
        "",
        window.location.href
      );
    }
    historyGuardAdded.current = true;
    document.body.style.overflow = "hidden";
    closeButton.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        requestClose();
        return;
      }
      if (event.key !== "Tab" || confirmDiscard) return;
      const focusable = focusableElements(dialog.current);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!hasUnsavedChanges()) return;
      event.preventDefault();
    };
    const onPopState = () => {
      if (closing.current) return;
      if (hasUnsavedChanges()) {
        window.history.forward();
        setConfirmDiscard(true);
        return;
      }
      closing.current = true;
      router.back();
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("beforeunload", onBeforeUnload);
    window.addEventListener("popstate", onPopState);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("beforeunload", onBeforeUnload);
      window.removeEventListener("popstate", onPopState);
      previouslyFocused?.focus();
    };
  }, [confirmDiscard, hasUnsavedChanges, historyGuardId, requestClose, router]);

  function closeFromBackdrop(event: MouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget) requestClose();
  }

  return (
    <div
      aria-label="Administrative record"
      aria-modal="true"
      className="fixed inset-0 z-50 grid items-end bg-zinc-950/65 p-0 backdrop-blur-[2px] sm:items-center sm:p-6"
      onMouseDown={closeFromBackdrop}
      role="dialog"
    >
      <div
        className="relative max-h-[96dvh] w-full overflow-y-auto rounded-t-2xl bg-zinc-50 shadow-2xl sm:mx-auto sm:max-h-[92dvh] sm:max-w-6xl sm:rounded-2xl"
        ref={dialog}
      >
        <div className="sticky top-0 z-10 flex justify-end border-b border-zinc-200 bg-white/95 px-4 py-3 backdrop-blur sm:px-6">
          <button
            aria-label="Close modal"
            className="inline-flex min-h-10 items-center justify-center rounded-md border border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-700 hover:border-emerald-600 hover:text-emerald-700"
            onClick={requestClose}
            ref={closeButton}
            type="button"
          >
            Close
          </button>
        </div>
        <div className="p-4 sm:p-6 lg:p-8">{children}</div>
      </div>
      <ControlConfirmDialog
        confirmLabel="Discard changes"
        description="Your unsaved entries will be lost. This cannot be undone after the modal closes."
        onCancel={() => setConfirmDiscard(false)}
        onConfirm={() => {
          dialog.current
            ?.querySelectorAll<HTMLFormElement>('form[data-admin-form="true"]')
            .forEach((form) => {
              form.dataset.dirty = "false";
            });
          setConfirmDiscard(false);
          closeModal();
        }}
        open={confirmDiscard}
        title="Discard unsaved changes?"
        tone="danger"
      />
    </div>
  );
}

function focusableElements(container: HTMLElement | null): HTMLElement[] {
  if (!container) return [];
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
    )
  ).filter((element) => !element.hidden && element.getAttribute("aria-hidden") !== "true");
}
