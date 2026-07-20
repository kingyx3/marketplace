"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";

export function ControlConfirmDialog({
  busy = false,
  cancelLabel = "Cancel",
  confirmLabel,
  description,
  onCancel,
  onConfirm,
  open,
  requireText,
  title,
  tone = "default",
}: {
  busy?: boolean;
  cancelLabel?: string;
  confirmLabel: string;
  description: string;
  onCancel: () => void;
  onConfirm: () => void;
  open: boolean;
  requireText?: string;
  title: string;
  tone?: "default" | "danger";
}) {
  const titleId = useId();
  const descriptionId = useId();
  const confirmButton = useRef<HTMLButtonElement>(null);
  const confirmationInput = useRef<HTMLInputElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const [confirmationText, setConfirmationText] = useState("");

  const cancel = useCallback(() => {
    setConfirmationText("");
    onCancel();
  }, [onCancel]);

  const confirm = useCallback(() => {
    setConfirmationText("");
    onConfirm();
  }, [onConfirm]);

  useEffect(() => {
    if (!open) return;

    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    window.requestAnimationFrame(() => {
      if (requireText) confirmationInput.current?.focus();
      else confirmButton.current?.focus();
    });

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) {
        event.preventDefault();
        cancel();
        return;
      }
      if (event.key !== "Tab") return;
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
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      previouslyFocused?.focus();
    };
  }, [busy, cancel, open, requireText]);

  if (!open) return null;
  const confirmationMatches = !requireText || confirmationText === requireText;

  return (
    <div
      className="fixed inset-0 z-[120] grid place-items-center bg-zinc-950/75 p-4"
      role="presentation"
    >
      <div
        aria-describedby={descriptionId}
        aria-labelledby={titleId}
        aria-modal="true"
        className="w-full max-w-lg rounded-xl border border-zinc-200 bg-white p-5 shadow-2xl sm:p-6"
        ref={dialog}
        role="alertdialog"
      >
        <h2 className="text-lg font-semibold text-zinc-950" id={titleId}>
          {title}
        </h2>
        <p className="mt-2 text-sm leading-6 text-zinc-600" id={descriptionId}>
          {description}
        </p>
        {requireText ? (
          <label className="mt-4 grid gap-1 text-sm font-medium text-zinc-800">
            Type <span className="font-mono text-rose-700">{requireText}</span> to continue
            <input
              autoComplete="off"
              className="min-h-11 rounded-md border border-zinc-300 px-3 text-base outline-none focus:border-rose-600 focus:ring-2 focus:ring-rose-100 sm:text-sm"
              disabled={busy}
              onChange={(event) => setConfirmationText(event.currentTarget.value)}
              ref={confirmationInput}
              value={confirmationText}
            />
          </label>
        ) : null}
        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <button
            className="min-h-11 rounded-md border border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-800 hover:border-zinc-500 disabled:opacity-60"
            disabled={busy}
            onClick={cancel}
            type="button"
          >
            {cancelLabel}
          </button>
          <button
            className={`min-h-11 rounded-md px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-zinc-400 ${
              tone === "danger"
                ? "bg-rose-700 hover:bg-rose-800"
                : "bg-zinc-950 hover:bg-emerald-700"
            }`}
            disabled={busy || !confirmationMatches}
            onClick={confirm}
            ref={confirmButton}
            type="button"
          >
            {busy ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
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
