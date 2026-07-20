import {
  AdminNumberField,
  AdminTextField,
} from "@/app/(shop)/control/_components/admin-form-fields";
import { runAdminOrderAction } from "@/app/actions/admin";

export function ManualReconciliationForm({
  orderId,
  providerPaymentId,
}: {
  orderId?: string | null;
  providerPaymentId?: string | null;
}) {
  return (
    <form action={runAdminOrderAction} className="grid gap-4 sm:grid-cols-2">
      <input name="action" type="hidden" value="record_manual_reconciliation" />
      <input name="provider" type="hidden" value="stripe" />
      <AdminTextField
        defaultValue={orderId ?? undefined}
        example="Order UUID"
        label="Order ID"
        name="orderId"
        required
      />
      <AdminTextField
        defaultValue={providerPaymentId ?? undefined}
        example="pi_..."
        label="Stripe payment reference"
        name="providerPaymentId"
        required
      />
      <AdminNumberField example="18900" label="Amount cents" min={1} name="amountCents" required />
      <AdminTextField
        defaultValue="SGD"
        example="SGD"
        label="Currency"
        maxLength={3}
        minLength={3}
        name="currency"
        required
      />
      <div className="sm:col-span-2">
        <AdminTextField
          example="Verified against Stripe dashboard and webhook event"
          label="Reason"
          maxLength={500}
          name="reason"
          required
        />
      </div>
      <button className="min-h-11 rounded-md bg-zinc-950 px-5 text-sm font-semibold text-white hover:bg-emerald-700 sm:col-span-2">
        Record audited reconciliation
      </button>
    </form>
  );
}
