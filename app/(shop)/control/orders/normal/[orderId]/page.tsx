import {
  AdminSelectField,
  AdminTextField,
} from "@/app/(shop)/control/_components/admin-form-fields";
import {
  ControlActionForm,
  ControlBackLink,
  ControlDangerButton,
  ControlData,
  ControlSaveButton,
} from "@/app/(shop)/control/_components/control-resource-ui";
import { PageHeader } from "@/app/_components/page-header";
import { StatusBadge } from "@/app/_components/status-badge";
import { runAdminOrderAction } from "@/app/actions/admin";
import { hasControlPermission, requireControlPermission } from "@/lib/control-access";
import { formatMoney } from "@/lib/money";
import { getAdminOrder } from "@/lib/orders";
import { createServiceClient } from "@/lib/supabase";
import { toOne } from "@/lib/supabase-relations";

export const dynamic = "force-dynamic";

export default async function NormalOrderPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;
  const { staff } = await requireControlPermission(
    "orders.view",
    `/control/orders/normal/${orderId}`
  );
  const order = await getAdminOrder(createServiceClient(), orderId);
  const customer = toOne(order.customers);
  const canManage = hasControlPermission(staff, "orders.manage");
  return (
    <div className="space-y-8">
      <PageHeader
        action={
          <>
            <StatusBadge tone="info">{order.status}</StatusBadge>
            <ControlBackLink href="/control/orders">Back to orders</ControlBackLink>
          </>
        }
        description={customer?.email ?? order.id}
        eyebrow="Control · Order"
        title={customer?.name || "Order"}
      />
      <section className="grid gap-4 sm:grid-cols-4">
        <Summary label="Total" value={formatMoney(order.total_cents, order.currency)} />
        <Summary label="Lines" value={String(order.order_items?.length ?? 0)} />
        <Summary label="Payments" value={String(order.payments?.length ?? 0)} />
        <Summary label="Placed" value={formatDate(order.placed_at ?? order.created_at)} />
      </section>
      <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
        <h2 className="font-semibold text-zinc-950">Order lines</h2>
        <div className="mt-4 divide-y divide-zinc-100">
          {(order.order_items ?? []).map((item) => (
            <div className="grid gap-2 py-3 text-sm sm:grid-cols-[1fr_auto_auto]" key={item.id}>
              <span className="font-medium text-zinc-950">
                {toOne(item.booster_box_skus)?.sku ?? "SKU"}
              </span>
              <span>{item.quantity} units</span>
              <span>{formatMoney(item.quantity * item.unit_price_cents, order.currency)}</span>
            </div>
          ))}
        </div>
      </section>
      {canManage ? (
        <section className="grid gap-4 lg:grid-cols-2">
          <ControlActionForm
            action={runAdminOrderAction}
            className="rounded-xl border border-rose-100 bg-white p-5 shadow-sm"
            confirmation={{
              title: "Cancel unpaid order?",
              description:
                "This releases its reserved stock and closes the order. The action is audited and cannot be reversed from this screen.",
              confirmLabel: "Cancel order",
              requireText: "CANCEL",
              tone: "danger",
            }}
            errorMessage="The order could not be cancelled. The reason has been preserved; refresh the order status before retrying."
            successMessage="Unpaid order cancelled and reserved stock released."
          >
            <input name="action" type="hidden" value="cancel_unpaid" />
            <input name="orderId" type="hidden" value={order.id} />
            <h2 className="font-semibold text-zinc-950">Cancel unpaid order</h2>
            <div className="mt-4">
              <AdminTextField
                example="Customer requested cancellation"
                label="Reason"
                maxLength={500}
                name="reason"
                required
              />
            </div>
            <div className="mt-4">
              <ControlDangerButton pendingLabel="Cancelling order…">
                Cancel unpaid order
              </ControlDangerButton>
            </div>
          </ControlActionForm>
          <ControlActionForm
            action={runAdminOrderAction}
            className="rounded-xl border border-amber-200 bg-amber-50 p-5 shadow-sm"
            confirmation={{
              title: "Create finance exception?",
              description:
                "This adds an audited exception to the finance review queue. Confirm the severity and details are accurate.",
              confirmLabel: "Create exception",
            }}
            errorMessage="The finance exception could not be created. Your severity and details have been preserved."
            successMessage="Finance exception created."
          >
            <input name="action" type="hidden" value="flag_payment_exception" />
            <input name="orderId" type="hidden" value={order.id} />
            <h2 className="font-semibold text-zinc-950">Flag payment exception</h2>
            <div className="mt-4 grid gap-4">
              <AdminSelectField
                defaultValue="warning"
                example="Warning"
                label="Severity"
                name="severity"
                options={[
                  { value: "info", label: "Info" },
                  { value: "warning", label: "Warning" },
                  { value: "critical", label: "Critical" },
                ]}
                required
              />
              <AdminTextField
                example="Mismatch requiring finance review"
                label="Detail"
                maxLength={1000}
                name="detail"
                required
              />
            </div>
            <div className="mt-4">
              <ControlSaveButton pendingLabel="Creating exception…">
                Create finance exception
              </ControlSaveButton>
            </div>
          </ControlActionForm>
        </section>
      ) : null}
    </div>
  );
}

function Summary({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
      <ControlData label={label} value={value} />
    </div>
  );
}
function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-SG", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Singapore",
  }).format(new Date(value));
}
