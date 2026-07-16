"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import {
  initialCustomerLifecycleActionState,
  setCustomerAccountDeleted,
} from "@/app/actions/customer-admin";

export function CustomerLifecycleControl({
  customerId,
  deleted,
  recoverable,
}: {
  customerId: string;
  deleted: boolean;
  recoverable: boolean;
}) {
  const [state, action] = useActionState(
    setCustomerAccountDeleted,
    initialCustomerLifecycleActionState
  );

  if (deleted && !recoverable) return null;

  return (
    <div className="mt-5">
      {state.status !== "idle" ? (
        <div
          className={
            state.status === "success"
              ? "mb-3 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900"
              : "mb-3 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800"
          }
          role={state.status === "error" ? "alert" : "status"}
        >
          {state.message}
        </div>
      ) : null}

      {deleted ? (
        <form action={action} className="flex justify-end">
          <input name="customerId" type="hidden" value={customerId} />
          <input name="deleted" type="hidden" value="false" />
          <SubmitButton mode="restore" />
        </form>
      ) : (
        <details className="border-t border-zinc-100 pt-4">
          <summary className="cursor-pointer text-right text-sm font-semibold text-rose-700">
            Disable account
          </summary>
          <form action={action} className="mt-3 grid justify-items-end gap-3">
            <input name="customerId" type="hidden" value={customerId} />
            <input name="deleted" type="hidden" value="true" />
            <label className="flex min-h-11 items-center gap-2 text-sm text-zinc-700">
              <input name="confirmDisable" required type="checkbox" value="yes" />
              Confirm account disable
            </label>
            <SubmitButton mode="disable" />
          </form>
        </details>
      )}
    </div>
  );
}

function SubmitButton({ mode }: { mode: "disable" | "restore" }) {
  const { pending } = useFormStatus();
  const restore = mode === "restore";

  return (
    <button
      className={
        restore
          ? "min-h-11 rounded-md bg-emerald-700 px-4 text-sm font-semibold text-white hover:bg-emerald-800 disabled:bg-zinc-400"
          : "min-h-11 rounded-md border border-rose-200 px-4 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:text-zinc-400"
      }
      disabled={pending}
    >
      {pending
        ? restore
          ? "Restoring…"
          : "Disabling…"
        : restore
          ? "Restore account"
          : "Disable account"}
    </button>
  );
}
