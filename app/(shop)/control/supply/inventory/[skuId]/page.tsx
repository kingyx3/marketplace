import { notFound } from "next/navigation";

import {
  AdminNumberField,
  AdminSelectField,
  AdminTextField,
} from "@/app/(shop)/control/_components/admin-form-fields";
import {
  ControlActionForm,
  ControlBackLink,
  ControlData,
  ControlSaveButton,
} from "@/app/(shop)/control/_components/control-resource-ui";
import { PageHeader } from "@/app/_components/page-header";
import { StatusBadge } from "@/app/_components/status-badge";
import { updateInventory } from "@/app/actions/admin";
import { hasControlPermission, requireControlPermission } from "@/lib/control-access";
import { fetchControlInventory } from "@/lib/control-supply";
import { createServiceClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function InventoryRecordPage({
  params,
}: {
  params: Promise<{ skuId: string }>;
}) {
  const { skuId } = await params;
  const { staff } = await requireControlPermission(
    "supply.view",
    `/control/supply/inventory/${skuId}`
  );
  const row = (await fetchControlInventory(createServiceClient())).find(
    (item) => item.skuId === skuId
  );
  if (!row) notFound();
  const canAdjust = hasControlPermission(staff, "inventory.adjust");

  return (
    <div className="space-y-8">
      <PageHeader
        action={
          <>
            <StatusBadge tone={row.available > row.safetyStock ? "success" : "warning"}>
              {Math.max(0, row.available - row.safetyStock)} sellable
            </StatusBadge>
            <ControlBackLink href="/control/supply">Back to supply</ControlBackLink>
          </>
        }
        description={`${row.sku} · Physical stock only; pricing and publication remain unchanged.`}
        eyebrow="Control · Inventory"
        title={row.productName}
      />
      <section className="grid gap-4 sm:grid-cols-4">
        <Summary label="On hand" value={String(row.onHand)} />
        <Summary label="Incoming" value={String(row.incoming)} />
        <Summary label="Allocated" value={String(row.allocated)} />
        <Summary label="Safety stock" value={String(row.safetyStock)} />
      </section>
      {canAdjust ? (
        <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6">
          <h2 className="font-semibold text-zinc-950">Adjust inventory</h2>
          <ControlActionForm
            action={updateInventory}
            className="mt-5 grid gap-4 sm:grid-cols-2"
            confirmation={{
              title: "Apply inventory adjustment?",
              description:
                "Stock changes affect storefront availability and order allocation. Confirm the counts and audit reason before applying them.",
              confirmLabel: "Apply adjustment",
            }}
            errorMessage="The stock adjustment could not be applied. Your counts and reason have been preserved."
            successMessage="Inventory adjusted and storefront availability refreshed."
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
            <div className="sm:col-span-2">
              <AdminTextField
                example="Counted during weekly stocktake"
                label="Reason note"
                maxLength={500}
                name="reasonNote"
              />
            </div>
            <div className="sm:col-span-2">
              <ControlSaveButton pendingLabel="Applying adjustment…">
                Save stock adjustment
              </ControlSaveButton>
            </div>
          </ControlActionForm>
        </section>
      ) : (
        <p className="rounded-xl border border-zinc-200 bg-white p-5 text-sm text-zinc-600">
          You have read-only supply access.
        </p>
      )}
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
