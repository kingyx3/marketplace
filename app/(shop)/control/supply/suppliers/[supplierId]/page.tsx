import { notFound } from "next/navigation";

import {
  ControlBackLink,
  ControlDangerButton,
  ControlData,
} from "@/app/(shop)/control/_components/control-resource-ui";
import { SupplierForm, type SupplierRecord } from "@/app/(shop)/control/_components/supplier-form";
import { PageHeader } from "@/app/_components/page-header";
import { StatusBadge } from "@/app/_components/status-badge";
import { setControlSupplierActive } from "@/app/actions/control";
import { hasControlPermission, requireControlPermission } from "@/lib/control-access";
import { createServiceClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function SupplierDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ supplierId: string }>;
  searchParams?: Promise<{ saved?: string }>;
}) {
  const { supplierId } = await params;
  const { staff } = await requireControlPermission(
    "supply.view",
    `/control/supply/suppliers/${supplierId}`
  );
  const canManage = hasControlPermission(staff, "suppliers.manage");
  const { data, error } = await createServiceClient()
    .from("suppliers")
    .select(
      "id, name, supplier_type, region, contact, payment_terms, min_order_cents, currency, notes, active, updated_at"
    )
    .eq("id", supplierId)
    .maybeSingle();

  if (error) throw new Error(`Supplier lookup failed: ${error.message}`);
  if (!data) notFound();

  const supplier = data as SupplierRecord;
  const saved = (await searchParams)?.saved === "1";

  return (
    <div className="space-y-8">
      <PageHeader
        action={
          <>
            <StatusBadge tone={supplier.active ? "success" : "warning"}>
              {supplier.active ? "Active" : "Archived"}
            </StatusBadge>
            <ControlBackLink href="/control/supply/suppliers">Back to suppliers</ControlBackLink>
          </>
        }
        description={`${supplier.supplier_type.replaceAll("_", " ")}${supplier.region ? ` · ${supplier.region}` : ""}`}
        eyebrow="Control · Supplier"
        title={supplier.name}
      />

      {saved ? (
        <div
          className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900"
          role="status"
        >
          Supplier saved successfully.
        </div>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-3">
        <Summary label="Currency" value={supplier.currency} />
        <Summary label="Payment terms" value={supplier.payment_terms ?? "Not set"} />
        <Summary
          label="Minimum order"
          value={
            supplier.min_order_cents === null
              ? "Not set"
              : `${supplier.currency} ${(supplier.min_order_cents / 100).toFixed(2)}`
          }
        />
      </section>

      {canManage ? (
        <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6">
          <SupplierForm supplier={supplier} />
        </section>
      ) : null}

      {canManage ? (
        <section className="rounded-xl border border-rose-100 bg-white p-5 shadow-sm">
          <h2 className="font-semibold text-zinc-950">Lifecycle</h2>
          <p className="mt-1 text-sm text-zinc-600">
            Suppliers with open purchase orders cannot be archived.
          </p>
          <form action={setControlSupplierActive} className="mt-4">
            <input name="id" type="hidden" value={supplier.id} />
            <input name="active" type="hidden" value={supplier.active ? "false" : "true"} />
            <ControlDangerButton>
              {supplier.active ? "Archive supplier" : "Restore supplier"}
            </ControlDangerButton>
          </form>
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
