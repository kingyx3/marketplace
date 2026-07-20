import Link from "next/link";

import {
  AdminNumberField,
  AdminSelectField,
  AdminTextField,
} from "@/app/(shop)/control/_components/admin-form-fields";
import { MetricCard } from "@/app/_components/metric-card";
import { PageHeader } from "@/app/_components/page-header";
import { StatusBadge } from "@/app/_components/status-badge";
import { recordSupplierPurchaseOrder, updateInventory } from "@/app/actions/admin";
import { hasControlPermission, requireControlPermission } from "@/lib/control-access";
import {
  fetchControlInventory,
  fetchControlPurchaseOrders,
  fetchControlSupplierOptions,
} from "@/lib/control-supply";
import { formatMoney } from "@/lib/money";
import { createServiceClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function ControlSupplyPage() {
  const { staff } = await requireControlPermission("supply.view", "/control/supply");
  const supabase = createServiceClient();
  const [inventory, purchaseOrders, suppliers] = await Promise.all([
    fetchControlInventory(supabase),
    fetchControlPurchaseOrders(supabase),
    fetchControlSupplierOptions(supabase),
  ]);
  const canAdjust = hasControlPermission(staff, "inventory.adjust");
  const canPurchase = hasControlPermission(staff, "purchase_orders.manage");

  return (
    <div className="space-y-8">
      <PageHeader
        action={
          <Link
            className="inline-flex min-h-10 items-center rounded-md border border-zinc-300 px-4 text-sm font-semibold text-zinc-800"
            href="/control/supply/suppliers"
          >
            Suppliers
          </Link>
        }
        description="Control physical stock, incoming supply, safety stock, suppliers, and purchase orders without changing price or publication."
        eyebrow="Control"
        title="Supply"
      />
      <section className="grid gap-4 sm:grid-cols-3">
        <MetricCard
          label="On hand"
          value={String(inventory.reduce((sum, row) => sum + row.onHand, 0))}
          detail="Physical units recorded"
        />
        <MetricCard
          label="Incoming"
          value={String(inventory.reduce((sum, row) => sum + row.incoming, 0))}
          detail="Confirmed expected units"
        />
        <MetricCard
          label="Open purchase orders"
          value={String(
            purchaseOrders.filter((order) => !["completed", "cancelled"].includes(order.status))
              .length
          )}
          detail="Supply commitments"
        />
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-zinc-950">Inventory</h2>
        {inventory.map((row) => (
          <article
            className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm"
            key={row.skuId}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold text-zinc-950">{row.productName}</h3>
                <p className="mt-1 text-xs text-zinc-500">{row.sku}</p>
              </div>
              <StatusBadge tone={row.available > row.safetyStock ? "success" : "warning"}>
                {Math.max(0, row.available - row.safetyStock)} available to sell
              </StatusBadge>
            </div>
            {canAdjust ? (
              <form
                action={updateInventory}
                className="mt-4 grid gap-3 lg:grid-cols-[8rem_8rem_8rem_12rem_minmax(12rem,1fr)_auto] lg:items-end"
              >
                <input name="skuId" type="hidden" value={row.skuId} />
                <AdminNumberField
                  defaultValue={row.onHand}
                  example="24"
                  label="On hand"
                  min={0}
                  name="onHand"
                  required
                />
                <AdminNumberField
                  defaultValue={row.incoming}
                  example="12"
                  label="Incoming"
                  min={0}
                  name="incoming"
                  required
                />
                <AdminNumberField
                  defaultValue={row.safetyStock}
                  example="2"
                  label="Safety stock"
                  min={0}
                  name="safetyStock"
                  required
                />
                <AdminSelectField
                  defaultValue="stock_count"
                  example="Stock count"
                  label="Reason"
                  name="reasonCode"
                  options={[
                    { value: "stock_count", label: "Stock count" },
                    { value: "damage", label: "Damage" },
                    { value: "supplier_update", label: "Supplier update" },
                    { value: "correction", label: "Correction" },
                    { value: "other", label: "Other" },
                  ]}
                  required
                />
                <AdminTextField
                  example="Counted during weekly stocktake"
                  label="Reason note"
                  maxLength={500}
                  name="reasonNote"
                />
                <button className="min-h-11 rounded-md bg-zinc-950 px-4 text-sm font-semibold text-white">
                  Save stock
                </button>
              </form>
            ) : null}
          </article>
        ))}
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6">
        <h2 className="text-lg font-semibold text-zinc-950">Purchase orders</h2>
        {canPurchase ? (
          <form action={recordSupplierPurchaseOrder} className="mt-4 grid gap-3 lg:grid-cols-2">
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
            <div className="lg:col-span-2">
              <AdminTextField
                example="Supplier reference or approval note"
                label="Notes"
                maxLength={500}
                name="notes"
              />
            </div>
            <button className="min-h-11 rounded-md bg-zinc-950 px-5 text-sm font-semibold text-white lg:col-span-2">
              Record purchase order
            </button>
          </form>
        ) : null}
        <div className="mt-6 grid gap-3 md:grid-cols-2">
          {purchaseOrders.map((order) => (
            <article className="rounded-lg border border-zinc-200 p-4" key={order.id}>
              <div className="flex justify-between gap-3">
                <p className="font-semibold text-zinc-950">{order.supplier}</p>
                <StatusBadge tone="info">{order.status}</StatusBadge>
              </div>
              <p className="mt-2 text-sm text-zinc-600">
                {order.boxes} units · {formatMoney(order.valueCents, order.currency)} ·{" "}
                {order.expectedAt ?? "Unscheduled"}
              </p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
