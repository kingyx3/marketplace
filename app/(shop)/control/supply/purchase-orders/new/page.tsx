import {
  AdminNumberField,
  AdminSelectField,
  AdminTextField,
} from "@/app/(shop)/control/_components/admin-form-fields";
import {
  ControlActionForm,
  ControlBackLink,
  ControlSaveButton,
} from "@/app/(shop)/control/_components/control-resource-ui";
import { PageHeader } from "@/app/_components/page-header";
import { recordSupplierPurchaseOrder } from "@/app/actions/admin";
import { requireControlPermission } from "@/lib/control-access";
import { fetchControlInventory, fetchControlSupplierOptions } from "@/lib/control-supply";
import { createServiceClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function NewPurchaseOrderPage() {
  await requireControlPermission("purchase_orders.manage", "/control/supply/purchase-orders/new");
  const supabase = createServiceClient();
  const [inventory, suppliers] = await Promise.all([
    fetchControlInventory(supabase),
    fetchControlSupplierOptions(supabase),
  ]);
  return (
    <div className="space-y-8">
      <PageHeader
        action={<ControlBackLink href="/control/supply">Back to supply</ControlBackLink>}
        description="Record an approved supplier commitment. The quantity is added to incoming stock after save."
        eyebrow="Control · Supply"
        title="Create purchase order"
      />
      <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6">
        <ControlActionForm
          action={recordSupplierPurchaseOrder}
          className="grid gap-4 sm:grid-cols-2"
          confirmation={{
            title: "Record supplier commitment?",
            description:
              "This creates a purchase order and immediately adds its quantity to incoming stock. Verify the supplier, SKU, quantity, and unit cost.",
            confirmLabel: "Record purchase order",
          }}
          errorMessage="The purchase order could not be recorded. All entered values have been preserved."
          successHref="/control/supply"
          successMessage="Purchase order recorded and incoming stock updated."
        >
          <AdminSelectField
            example="Select supplier"
            label="Supplier"
            name="supplierId"
            options={suppliers.map((supplier) => ({ value: supplier.id, label: supplier.name }))}
            required
          />
          <AdminSelectField
            example="Select SKU"
            label="SKU"
            name="skuId"
            options={inventory.map((row) => ({
              value: row.skuId,
              label: `${row.productName} · ${row.sku}`,
            }))}
            required
          />
          <AdminNumberField example="12" label="Quantity" min={1} name="quantity" required />
          <AdminNumberField
            example="12000"
            label="Unit cost cents"
            min={0}
            name="unitCostCents"
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
          <AdminTextField example="2026-08-15" label="Expected" name="expectedAt" type="date" />
          <div className="sm:col-span-2">
            <AdminTextField
              example="Supplier reference or approval note"
              label="Notes"
              maxLength={500}
              name="notes"
            />
          </div>
          <div className="sm:col-span-2">
            <ControlSaveButton pendingLabel="Recording purchase order…">
              Record purchase order
            </ControlSaveButton>
          </div>
        </ControlActionForm>
      </section>
    </div>
  );
}
