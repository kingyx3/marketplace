"use client";

import { useRouter } from "next/navigation";
import {
  createContext,
  useContext,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type FormEvent,
} from "react";
import { useFormStatus } from "react-dom";

import { ControlConfirmDialog } from "@/app/(shop)/control/_components/control-confirm-dialog";
import type { AdminActionConfirmation, AdminActionResult } from "@/lib/admin-action-state";
import { validateAdminFormRelationships } from "@/lib/admin-form-relationships";

type AdminAction = (formData: FormData) => Promise<AdminActionResult | void>;

interface AdminActionFormContextValue {
  pending: boolean;
  fieldErrors: Record<string, string>;
}

const AdminActionFormContext = createContext<AdminActionFormContextValue>({
  pending: false,
  fieldErrors: {},
});

export function AdminActionForm({
  action,
  children,
  confirmation,
  errorMessage = "The change could not be saved. Review the form and try again.",
  successMessage = "Changes saved.",
  successHref,
  ...formProps
}: Omit<ComponentPropsWithoutRef<"form">, "action" | "onSubmit"> & {
  action: AdminAction;
  confirmation?: AdminActionConfirmation;
  errorMessage?: string;
  successMessage?: string;
  successHref?: string;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const summaryRef = useRef<HTMLDivElement>(null);
  const [pending, setPending] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<AdminActionResult | null>(null);

  function validate(form: HTMLFormElement): boolean {
    const fieldErrors = validateAdminFormRelationships(new FormData(form));
    if (form.checkValidity() && Object.keys(fieldErrors).length === 0) return true;
    setResult({
      status: "error",
      message: "Review the highlighted fields before submitting.",
      fieldErrors,
    });
    window.requestAnimationFrame(() => {
      const firstField = Object.keys(fieldErrors)[0];
      const field = firstField ? form.elements.namedItem(firstField) : null;
      if (field instanceof HTMLElement) field.focus();
      else form.querySelector<HTMLElement>(":invalid")?.focus();
      form.reportValidity();
    });
    return false;
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || !validate(event.currentTarget)) return;
    if (confirmation) {
      setConfirming(true);
      return;
    }
    void execute();
  }

  async function execute() {
    const form = formRef.current;
    if (!form || pending || !validate(form)) return;
    setConfirming(false);
    setPending(true);
    setResult(null);

    try {
      const actionResult = await action(new FormData(form));
      const nextResult = actionResult ?? { status: "success" as const, message: successMessage };
      setResult(nextResult);

      if (nextResult.status === "error") {
        window.requestAnimationFrame(() => {
          const firstField = Object.keys(nextResult.fieldErrors ?? {})[0];
          if (firstField) {
            const field = form.elements.namedItem(firstField);
            if (field instanceof HTMLElement) field.focus();
          } else {
            summaryRef.current?.focus();
          }
        });
        return;
      }

      form.dataset.dirty = "false";
      router.refresh();
      const destination = nextResult.redirectTo ?? successHref;
      if (destination) router.replace(destination);
    } catch {
      setResult({ status: "error", message: errorMessage });
      window.requestAnimationFrame(() => summaryRef.current?.focus());
    } finally {
      setPending(false);
    }
  }

  function clearCorrectedField(target: EventTarget) {
    if (!(
      target instanceof HTMLInputElement ||
      target instanceof HTMLSelectElement ||
      target instanceof HTMLTextAreaElement
    )) {
      return;
    }
    const name = target.name;
    if (!name || !result?.fieldErrors?.[name]) return;
    const fieldErrors = { ...result.fieldErrors };
    delete fieldErrors[name];
    setResult({ ...result, fieldErrors });
  }

  return (
    <AdminActionFormContext.Provider value={{ pending, fieldErrors: result?.fieldErrors ?? {} }}>
      <form
        {...formProps}
        aria-busy={pending}
        data-admin-form="true"
        data-dirty="false"
        onChangeCapture={(event) => clearCorrectedField(event.target)}
        onInputCapture={(event) => {
          event.currentTarget.dataset.dirty = "true";
          clearCorrectedField(event.target);
        }}
        onSubmit={submit}
        ref={formRef}
      >
        {result ? (
          <div
            aria-live={result.status === "error" ? "assertive" : "polite"}
            className={`rounded-md border px-3 py-2 text-sm ${
              result.status === "error"
                ? "border-rose-200 bg-rose-50 text-rose-900"
                : "border-emerald-200 bg-emerald-50 text-emerald-900"
            }`}
            ref={summaryRef}
            role={result.status === "error" ? "alert" : "status"}
            tabIndex={-1}
          >
            <p className="font-medium">{result.message}</p>
            {result.fieldErrors && Object.keys(result.fieldErrors).length > 0 ? (
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {Object.entries(result.fieldErrors).map(([field, message]) => (
                  <li key={field}>{message}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
        {children}
      </form>
      <ControlConfirmDialog
        busy={pending}
        confirmLabel={confirmation?.confirmLabel ?? "Continue"}
        description={confirmation?.description ?? "Confirm this action."}
        onCancel={() => setConfirming(false)}
        onConfirm={() => void execute()}
        open={confirming}
        requireText={confirmation?.requireText}
        title={confirmation?.title ?? "Confirm action"}
        tone={confirmation?.tone}
      />
    </AdminActionFormContext.Provider>
  );
}

export function AdminSubmitButton({
  children,
  pendingLabel = "Saving…",
  ...buttonProps
}: ComponentPropsWithoutRef<"button"> & { pendingLabel?: string }) {
  const context = useContext(AdminActionFormContext);
  const nativeStatus = useFormStatus();
  const pending = context.pending || nativeStatus.pending;

  return (
    <button {...buttonProps} disabled={buttonProps.disabled || pending} type="submit">
      {pending ? pendingLabel : children}
    </button>
  );
}

export function useAdminFieldError(name: string): string | undefined {
  return useContext(AdminActionFormContext).fieldErrors[name];
}
