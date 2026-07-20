import {
  AdminNumberField,
  AdminSelectField,
  AdminTextField,
} from "@/app/(shop)/control/_components/admin-form-fields";
import { ControlBackLink } from "@/app/(shop)/control/_components/control-resource-ui";
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
        <form action={recordSupplierPurchaseOrder} className="grid gap-4 sm:grid-cols-2">
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
          <button className="min-h-11 rounded-md bg-zinc-950 px-5 text-sm font-semibold text-white hover:bg-emerald-700 sm:col-span-2">
            Record purchase order
          </button>
        </form>
      </section>
    </div>
  );
}
