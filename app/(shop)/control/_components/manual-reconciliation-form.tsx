import {
  AdminNumberField,
  AdminTextField,
} from "@/app/(shop)/control/_components/admin-form-fields";
import {
  ControlActionForm,
  ControlSaveButton,
} from "@/app/(shop)/control/_components/control-resource-ui";
import { runAdminOrderAction } from "@/app/actions/admin";

export function ManualReconciliationForm({
  orderId,
  providerPaymentId,
}: {
  orderId?: string | null;
  providerPaymentId?: string | null;
}) {
  return (
    <ControlActionForm
      action={runAdminOrderAction}
      className="grid gap-4 sm:grid-cols-2"
      confirmation={{
        title: "Record manual payment reconciliation?",
        description:
          "This writes an audited payment reconciliation against the order. Verify the HitPay payment-request reference, amount, currency, and reason against the provider dashboard.",
        confirmLabel: "Record reconciliation",
        requireText: "RECONCILE",
        tone: "danger",
      }}
      errorMessage="The reconciliation could not be recorded. All payment details have been preserved for review."
      successHref="/control/finance"
      successMessage="Audited payment reconciliation recorded."
    >
      <input name="action" type="hidden" value="record_manual_reconciliation" />
      <input name="provider" type="hidden" value="hitpay" />
      <AdminTextField
        defaultValue={orderId ?? undefined}
        example="Order UUID"
        label="Order ID"
        maxLength={36}
        minLength={36}
        name="orderId"
        pattern="[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}"
        patternMessage="Order ID must be a UUID."
        required
      />
      <AdminTextField
        defaultValue={providerPaymentId ?? undefined}
        example="Payment Request UUID"
        label="HitPay payment-request reference"
        maxLength={200}
        minLength={3}
        name="providerPaymentId"
        required
      />
      <AdminNumberField
        example="18900"
        label="Amount cents"
        min={1}
        name="amountCents"
        required
      />
      <AdminTextField
        defaultValue="SGD"
        example="SGD"
        label="Currency"
        maxLength={3}
        minLength={3}
        name="currency"
        pattern="[A-Za-z]{3}"
        patternMessage="Currency must be a 3-letter code, such as SGD."
        required
      />
      <div className="sm:col-span-2">
        <AdminTextField
          example="Verified against HitPay dashboard and signed webhook event"
          label="Reason"
          maxLength={500}
          name="reason"
          required
        />
      </div>
      <div className="sm:col-span-2">
        <ControlSaveButton pendingLabel="Recording reconciliation…">
          Record audited reconciliation
        </ControlSaveButton>
      </div>
    </ControlActionForm>
  );
}
