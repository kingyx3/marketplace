import {
  setControlSupplierActive,
  upsertControlSupplier,
} from "@/app/actions/control";
import { requireControlPermission } from "@/lib/control-access";
import { createServiceClient } from "@/lib/supabase";

interface SupplierRow {
  id: string;
  name: string;
  supplier_type: "distributor" | "publisher_direct" | "peer_retailer" | "other";
  region: string | null;
  contact: Record<string, unknown> | null;
  payment_terms: string | null;
  min_order_cents: number | null;
  currency: string;
  notes: string | null;
  active: boolean;
  updated_at: string;
}

export const dynamic = "force-dynamic";

export default async function ControlSuppliersPage() {
  await requireControlPermission("manage_suppliers", "/control/suppliers");
  const { data, error } = await createServiceClient()
    .from("suppliers")
    .select(
      "id, name, supplier_type, region, contact, payment_terms, min_order_cents, currency, notes, active, updated_at"
    )
    .order("active", { ascending: false })
    .order("name");

  if (error) throw new Error(`Supplier list failed: ${error.message}`);
  const suppliers = (data ?? []) as SupplierRow[];

  return (
    <div className="space-y-8">
      <PageHeading
        title="Suppliers"
        description="Manage supplier records, contacts, commercial terms, and operational status. Suppliers with open purchase orders cannot be archived."
      />

      <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-zinc-950">Add supplier</h2>
        <SupplierForm />
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-zinc-950">Supplier directory</h2>
          <span className="text-sm text-zinc-500">{suppliers.length} records</span>
        </div>

        {suppliers.length === 0 ? (
          <EmptyState text="No suppliers have been configured." />
        ) : (
          <div className="grid gap-4 xl:grid-cols-2">
            {suppliers.map((supplier) => (
              <SupplierCard key={supplier.id} supplier={supplier} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function SupplierCard({ supplier }: { supplier: SupplierRow }) {
  const contact = supplier.contact ?? {};
  const contactName = typeof contact.name === "string" ? contact.name : "";
  const contactEmail = typeof contact.email === "string" ? contact.email : "";
  const contactPhone = typeof contact.phone === "string" ? contact.phone : "";

  return (
    <article className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold text-zinc-950">{supplier.name}</h3>
            <Status active={supplier.active} />
          </div>
          <p className="mt-1 text-sm text-zinc-500">
            {supplier.supplier_type.replaceAll("_", " ")}
            {supplier.region ? ` · ${supplier.region}` : ""}
          </p>
        </div>
        <form action={setControlSupplierActive}>
          <input name="id" type="hidden" value={supplier.id} />
          <input name="active" type="hidden" value={supplier.active ? "false" : "true"} />
          <button
            className={
              supplier.active
                ? "rounded-md border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50"
                : "rounded-md border border-emerald-200 px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"
            }
          >
            {supplier.active ? "Archive" : "Restore"}
          </button>
        </form>
      </div>

      <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
        <Data label="Contact" value={contactName || "Not set"} />
        <Data label="Email" value={contactEmail || "Not set"} />
        <Data label="Phone" value={contactPhone || "Not set"} />
        <Data label="Payment terms" value={supplier.payment_terms || "Not set"} />
        <Data
          label="Minimum order"
          value={
            supplier.min_order_cents === null
              ? "Not set"
              : `${supplier.currency} ${(supplier.min_order_cents / 100).toFixed(2)}`
          }
        />
        <Data label="Updated" value={new Date(supplier.updated_at).toLocaleDateString("en-SG")} />
      </dl>

      <details className="mt-5 border-t border-zinc-100 pt-4">
        <summary className="cursor-pointer text-sm font-semibold text-zinc-700">Edit supplier</summary>
        <SupplierForm
          supplier={supplier}
          contactName={contactName}
          contactEmail={contactEmail}
          contactPhone={contactPhone}
        />
      </details>
    </article>
  );
}

function SupplierForm({
  supplier,
  contactName = "",
  contactEmail = "",
  contactPhone = "",
}: {
  supplier?: SupplierRow;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
}) {
  return (
    <form action={upsertControlSupplier} className="mt-4 grid gap-4">
      {supplier ? <input name="supplierId" type="hidden" value={supplier.id} /> : null}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Field label="Name" name="name" required value={supplier?.name} />
        <Select
          label="Type"
          name="supplierType"
          value={supplier?.supplier_type ?? "distributor"}
          options={[
            ["distributor", "Distributor"],
            ["publisher_direct", "Publisher direct"],
            ["peer_retailer", "Peer retailer"],
            ["other", "Other"],
          ]}
        />
        <Field label="Region" name="region" value={supplier?.region ?? ""} />
        <Field label="Currency" name="currency" required value={supplier?.currency ?? "SGD"} />
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <Field label="Contact name" name="contactName" value={contactName} />
        <Field label="Contact email" name="contactEmail" type="email" value={contactEmail} />
        <Field label="Contact phone" name="contactPhone" value={contactPhone} />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Payment terms" name="paymentTerms" value={supplier?.payment_terms ?? ""} />
        <Field
          label="Minimum order (cents)"
          min={0}
          name="minOrderCents"
          type="number"
          value={supplier?.min_order_cents?.toString() ?? ""}
        />
      </div>
      <label className="grid gap-1 text-sm font-medium text-zinc-700">
        Notes
        <textarea
          className="min-h-24 rounded-md border border-zinc-300 px-3 py-2 text-sm"
          defaultValue={supplier?.notes ?? ""}
          maxLength={2000}
          name="notes"
        />
      </label>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm font-medium text-zinc-700">
          <input name="active" type="hidden" value="false" />
          <input defaultChecked={supplier?.active ?? true} name="active" type="checkbox" value="true" />
          Active
        </label>
        <button className="rounded-md bg-zinc-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700">
          {supplier ? "Save supplier" : "Create supplier"}
        </button>
      </div>
    </form>
  );
}

function Field({
  label,
  name,
  value,
  required = false,
  type = "text",
  min,
}: {
  label: string;
  name: string;
  value?: string;
  required?: boolean;
  type?: string;
  min?: number;
}) {
  return (
    <label className="grid gap-1 text-sm font-medium text-zinc-700">
      {label}
      <input
        className="min-h-10 rounded-md border border-zinc-300 px-3 text-sm"
        defaultValue={value}
        min={min}
        name={name}
        required={required}
        type={type}
      />
    </label>
  );
}

function Select({
  label,
  name,
  value,
  options,
}: {
  label: string;
  name: string;
  value: string;
  options: Array<[string, string]>;
}) {
  return (
    <label className="grid gap-1 text-sm font-medium text-zinc-700">
      {label}
      <select
        className="min-h-10 rounded-md border border-zinc-300 px-3 text-sm"
        defaultValue={value}
        name={name}
      >
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
    </label>
  );
}

function PageHeading({ title, description }: { title: string; description: string }) {
  return (
    <div>
      <p className="text-sm font-semibold uppercase tracking-[0.16em] text-emerald-700">Operations</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-950">{title}</h1>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-600">{description}</p>
    </div>
  );
}

function Status({ active }: { active: boolean }) {
  return (
    <span
      className={
        active
          ? "rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700"
          : "rounded-full bg-zinc-100 px-2 py-1 text-xs font-semibold text-zinc-600"
      }
    >
      {active ? "Active" : "Archived"}
    </span>
  );
}

function Data({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">{label}</dt>
      <dd className="mt-1 text-zinc-800">{value}</dd>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="rounded-xl border border-dashed border-zinc-300 bg-white p-8 text-sm text-zinc-500">{text}</div>;
}
