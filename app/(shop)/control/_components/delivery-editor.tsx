import {
  AdminSelectField,
  AdminTextField,
} from "@/app/(shop)/control/_components/admin-form-fields";
import {
  ControlActionForm,
  ControlData,
  ControlSaveButton,
} from "@/app/(shop)/control/_components/control-resource-ui";
import { StatusBadge } from "@/app/_components/status-badge";
import {
  arrangeDelivery,
  markDeliveryPacking,
  updateDeliveryStatus,
} from "@/app/actions/deliveries";
import {
  deliveryStatuses,
  type AdminDeliveryOrder,
  type AdminDeliveryShipment,
  type DeliveryStatus,
} from "@/lib/deliveries";
import { formatMoney } from "@/lib/money";
import { formatDate, formatStatus } from "@/lib/order-display";

export function DeliveryEditor({ order }: { order: AdminDeliveryOrder }) {
  const shipment = order.latestShipment;
  const address = order.shippingAddress ?? {};
  const canArrange =
    !shipment || ["pending", "label_created", "returned", "lost"].includes(shipment.status);

  return (
    <div className="grid gap-6">
      <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="font-semibold text-zinc-950">{order.customer?.name || "Customer"}</h2>
            <p className="mt-1 break-all text-sm text-zinc-600">
              {order.customer?.email ?? "Unknown email"}
            </p>
            <p className="mt-1 break-all font-mono text-xs text-zinc-400">{order.id}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <StatusBadge tone={orderTone(order.status)}>{formatStatus(order.status)}</StatusBadge>
            <StatusBadge tone={shipmentTone(shipment?.status)}>
              {shipment ? formatStatus(shipment.status) : "Ready"}
            </StatusBadge>
          </div>
        </div>

        <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
          <ControlData label="Order total" value={formatMoney(order.totalCents, order.currency)} />
          <ControlData label="Captured" value={formatMoney(order.capturedCents, order.currency)} />
          <ControlData
            label="Items"
            value={String(order.items.reduce((sum, item) => sum + item.quantity, 0))}
          />
          <ControlData label="Placed" value={formatDate(order.placedAt ?? order.createdAt)} />
          <ControlData label="Shipping service" value={order.shippingService ?? "Not assigned"} />
          <ControlData label="Address" value={addressSummary(address)} />
        </dl>

        <div className="mt-5 grid gap-2 rounded-lg border border-zinc-100 bg-zinc-50 p-4 text-sm">
          {order.items.map((item) => (
            <div className="flex justify-between gap-4" key={item.id}>
              <span className="text-zinc-700">{item.productName}</span>
              <span className="shrink-0 font-medium text-zinc-950">
                {item.quantity} × {item.referenceCode ?? "product"}
              </span>
            </div>
          ))}
        </div>

        {shipment ? <ShipmentSummary shipment={shipment} /> : null}
      </section>

      {order.status === "paid" ? (
        <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="font-semibold text-zinc-950">Packing</h2>
          <p className="mt-1 text-sm text-zinc-600">
            Mark the fully paid order as packing before arranging handoff.
          </p>
          <ControlActionForm
            action={markDeliveryPacking}
            className="mt-4"
            confirmation={{
              title: "Mark order as packing?",
              description:
                "This advances the paid order into fulfilment and records the administrator action.",
              confirmLabel: "Mark packing",
            }}
            errorMessage="The order could not be moved to packing. Refresh its payment status and try again."
            successMessage="Order marked as packing."
          >
            <input name="orderId" type="hidden" value={order.id} />
            <ControlSaveButton>Mark packing</ControlSaveButton>
          </ControlActionForm>
        </section>
      ) : null}

      {canArrange ? (
        <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6">
          <h2 className="font-semibold text-zinc-950">
            {shipment && ["pending", "label_created"].includes(shipment.status)
              ? "Update delivery arrangement"
              : "Arrange delivery"}
          </h2>
          <p className="mt-1 text-sm text-zinc-600">
            Confirm the carrier and recipient details before saving.
          </p>
          <ControlActionForm
            action={arrangeDelivery}
            className="mt-5 grid gap-4"
            confirmation={{
              title: shipment ? "Update delivery arrangement?" : "Arrange delivery?",
              description:
                "The carrier and recipient address will be saved to the shipment and exposed to fulfilment operations. Verify them carefully.",
              confirmLabel: shipment ? "Update arrangement" : "Arrange delivery",
            }}
            errorMessage="The delivery arrangement could not be saved. All carrier and address entries have been preserved."
            successMessage="Delivery arrangement saved."
          >
            <input name="orderId" type="hidden" value={order.id} />
            <div className="grid gap-4 sm:grid-cols-2">
              <AdminTextField
                defaultValue={shipment?.carrier ?? order.shippingService ?? ""}
                example="Ninja Van"
                label="Carrier"
                maxLength={80}
                name="carrier"
                required
              />
              <AdminTextField
                defaultValue={shipment?.trackingNumber ?? ""}
                example="SG123456789"
                hint="Optional until a label is created."
                label="Tracking number"
                maxLength={120}
                name="trackingNumber"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <AdminTextField
                defaultValue={addressValue(address, "recipientName")}
                example="Alex Tan"
                label="Recipient"
                maxLength={120}
                name="recipientName"
                required
              />
              <AdminTextField
                defaultValue={addressValue(address, "phone")}
                example="+65 9123 4567"
                label="Phone"
                maxLength={50}
                name="phone"
              />
            </div>
            <AdminTextField
              defaultValue={addressValue(address, "line1")}
              example="1 Raffles Place"
              label="Address line 1"
              maxLength={200}
              name="line1"
              required
            />
            <AdminTextField
              defaultValue={addressValue(address, "line2")}
              example="#10-01"
              label="Address line 2"
              maxLength={200}
              name="line2"
            />
            <div className="grid gap-4 sm:grid-cols-3">
              <AdminTextField
                defaultValue={addressValue(address, "city")}
                example="Singapore"
                label="City"
                maxLength={120}
                name="city"
              />
              <AdminTextField
                defaultValue={addressValue(address, "state")}
                example="Singapore"
                label="State"
                maxLength={120}
                name="state"
              />
              <AdminTextField
                defaultValue={addressValue(address, "postalCode")}
                example="048616"
                label="Postal code"
                maxLength={32}
                name="postalCode"
                required
              />
            </div>
            <AdminTextField
              defaultValue={addressValue(address, "countryCode") || "SG"}
              example="SG"
              hint="Two-letter country code."
              label="Country code"
              maxLength={2}
              minLength={2}
              name="countryCode"
              pattern="[A-Za-z]{2}"
              patternMessage="Use a two-letter country code such as SG."
              required
            />
            <div className="flex justify-end">
              <ControlSaveButton>Save arrangement</ControlSaveButton>
            </div>
          </ControlActionForm>
        </section>
      ) : null}

      {shipment ? (
        <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="font-semibold text-zinc-950">Delivery status</h2>
          <ControlActionForm
            action={updateDeliveryStatus}
            className="mt-4 grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end"
            confirmation={{
              title: "Update delivery status?",
              description:
                "This customer-visible status change is audited. Verify the carrier state before confirming.",
              confirmLabel: "Update status",
            }}
            errorMessage="The delivery status could not be updated. The selected status has been preserved."
            successMessage="Delivery status updated."
          >
            <input name="orderId" type="hidden" value={order.id} />
            <input name="shipmentId" type="hidden" value={shipment.id} />
            <AdminSelectField
              defaultValue={shipment.status}
              example="In transit"
              hint="Manual operational status."
              label="Status"
              name="status"
              options={deliveryStatuses.map((status) => ({
                value: status,
                label: formatStatus(status),
              }))}
              required
            />
            <ControlSaveButton>Update status</ControlSaveButton>
          </ControlActionForm>
        </section>
      ) : null}
    </div>
  );
}

function ShipmentSummary({ shipment }: { shipment: AdminDeliveryShipment }) {
  return (
    <dl className="mt-5 grid gap-3 rounded-lg border border-emerald-100 bg-emerald-50 p-4 text-sm sm:grid-cols-2">
      <ControlData label="Carrier" value={shipment.carrier ?? "Not assigned"} />
      <ControlData label="Tracking" value={shipment.trackingNumber ?? "Pending"} />
      <ControlData label="Shipped" value={formatDate(shipment.shippedAt)} />
      <ControlData label="Delivered" value={formatDate(shipment.deliveredAt)} />
    </dl>
  );
}

function addressValue(address: Record<string, unknown>, key: string): string {
  const value = address[key];
  return typeof value === "string" ? value : "";
}

function addressSummary(address: Record<string, unknown>): string {
  const parts = [
    addressValue(address, "line1"),
    addressValue(address, "line2"),
    addressValue(address, "city"),
    addressValue(address, "state"),
    addressValue(address, "postalCode"),
    addressValue(address, "countryCode"),
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : "Not provided";
}

function orderTone(status: string) {
  if (["paid", "packing", "shipped", "delivered"].includes(status)) return "success" as const;
  if (["cancelled", "refunded"].includes(status)) return "danger" as const;
  return "info" as const;
}

function shipmentTone(status?: DeliveryStatus) {
  if (status === "delivered") return "success" as const;
  if (["returned", "lost"].includes(status ?? "")) return "danger" as const;
  if (["pending", "label_created"].includes(status ?? "")) return "warning" as const;
  return "info" as const;
}
