"use client";

import {
  ControlActionForm,
  ControlDangerButton,
  ControlSaveButton,
} from "@/app/(shop)/control/_components/control-resource-ui";
import { updateCustomerAccountLifecycle } from "@/app/actions/customer-admin";

export function CustomerLifecycleControl({
  customerId,
  deleted,
  recoverable,
}: {
  customerId: string;
  deleted: boolean;
  recoverable: boolean;
}) {
  if (deleted && !recoverable) return null;

  return (
    <div className="mt-5">
      {deleted ? (
        <ControlActionForm
          action={updateCustomerAccountLifecycle}
          className="flex justify-end"
          confirmation={{
            title: "Restore customer account?",
            description:
              "This re-enables sign-in for the linked identity and records the administrator restoration in the audit log.",
            confirmLabel: "Restore account",
          }}
          errorMessage="The customer account could not be restored. Verify the linked sign-in identity and try again."
          successMessage="Customer account restored."
        >
          <input name="customerId" type="hidden" value={customerId} />
          <input name="deleted" type="hidden" value="false" />
          <ControlSaveButton pendingLabel="Restoring…">Restore account</ControlSaveButton>
        </ControlActionForm>
      ) : (
        <details className="border-t border-zinc-100 pt-4">
          <summary className="cursor-pointer text-right text-sm font-semibold text-rose-700">
            Disable account
          </summary>
          <ControlActionForm
            action={updateCustomerAccountLifecycle}
            className="mt-3 grid justify-items-end gap-3"
            confirmation={{
              title: "Disable customer account?",
              description:
                "This blocks the linked identity from signing in, opts it out of marketing, and records the administrator action. Active staff and your own account are protected.",
              confirmLabel: "Disable account",
              requireText: "DISABLE",
              tone: "danger",
            }}
            errorMessage="The customer account could not be disabled. The account may be protected or its identity may have changed."
            successMessage="Customer account disabled."
          >
            <input name="customerId" type="hidden" value={customerId} />
            <input name="deleted" type="hidden" value="true" />
            <input name="confirmDisable" type="hidden" value="yes" />
            <ControlDangerButton pendingLabel="Disabling…">Disable account</ControlDangerButton>
          </ControlActionForm>
        </details>
      )}
    </div>
  );
}
