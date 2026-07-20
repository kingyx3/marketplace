import {
  AdminNumberField,
  AdminSelectField,
  AdminTextField,
  AdminTextareaField,
} from "@/app/(shop)/control/_components/admin-form-fields";
import {
  ControlActionForm,
  ControlSaveButton,
} from "@/app/(shop)/control/_components/control-resource-ui";
import { upsertControlSupplier } from "@/app/actions/control";

export interface SupplierRecord {
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

export function SupplierForm({ supplier }: { supplier?: SupplierRecord }) {
  const contact = supplier?.contact ?? {};
  const contactName = typeof contact.name === "string" ? contact.name : "";
  const contactEmail = typeof contact.email === "string" ? contact.email : "";
  const contactPhone = typeof contact.phone === "string" ? contact.phone : "";

  return (
    <ControlActionForm
      action={upsertControlSupplier}
      className="grid gap-5"
      errorMessage="The supplier could not be saved. Your entries are still here; review them and try again."
      successHref="/control/supply/suppliers"
      successMessage={supplier ? "Supplier updated." : "Supplier created."}
    >
      {supplier ? <input name="supplierId" type="hidden" value={supplier.id} /> : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <AdminTextField
          defaultValue={supplier?.name}
          example="North Star Distribution"
          hint="Use the legal or operating name used on purchase orders."
          label="Name"
          maxLength={160}
          minLength={2}
          name="name"
          required
        />
        <AdminSelectField
          defaultValue={supplier?.supplier_type ?? "distributor"}
          example="Distributor"
          hint="Classifies the commercial relationship."
          label="Type"
          name="supplierType"
          options={[
            { value: "distributor", label: "Distributor" },
            { value: "publisher_direct", label: "Publisher direct" },
            { value: "peer_retailer", label: "Peer retailer" },
            { value: "other", label: "Other" },
          ]}
          required
        />
        <AdminTextField
          defaultValue={supplier?.region ?? ""}
          example="Singapore"
          hint="Optional market, country, or fulfilment region."
          label="Region"
          maxLength={160}
          name="region"
        />
        <AdminTextField
          defaultValue={supplier?.currency ?? "SGD"}
          example="SGD"
          hint="Three-letter settlement currency."
          label="Currency"
          maxLength={3}
          minLength={3}
          name="currency"
          pattern="[A-Za-z]{3}"
          patternMessage="Currency must be a 3-letter code, such as SGD."
          required
        />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <AdminTextField
          defaultValue={contactName}
          example="Jamie Tan"
          hint="Optional primary commercial contact."
          label="Contact name"
          maxLength={160}
          name="contactName"
        />
        <AdminTextField
          defaultValue={contactEmail}
          example="orders@example.com"
          hint="Optional supplier contact email."
          label="Contact email"
          maxLength={320}
          name="contactEmail"
          type="email"
        />
        <AdminTextField
          defaultValue={contactPhone}
          example="+65 6123 4567"
          hint="Optional contact number."
          label="Contact phone"
          maxLength={80}
          name="contactPhone"
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <AdminTextField
          defaultValue={supplier?.payment_terms ?? ""}
          example="Net 30"
          hint="Optional agreed payment terms."
          label="Payment terms"
          maxLength={500}
          name="paymentTerms"
        />
        <AdminNumberField
          defaultValue={supplier?.min_order_cents ?? ""}
          example="50000"
          hint="Optional minimum purchase order value in cents."
          label="Minimum order (cents)"
          min={0}
          name="minOrderCents"
        />
      </div>

      <AdminTextareaField
        defaultValue={supplier?.notes ?? ""}
        example="Requires purchase-order reference on all invoices."
        hint="Optional internal operational notes."
        label="Notes"
        maxLength={2000}
        name="notes"
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex min-h-11 items-center gap-2 text-sm font-medium text-zinc-700">
          <input name="active" type="hidden" value="false" />
          <input
            defaultChecked={supplier?.active ?? true}
            name="active"
            type="checkbox"
            value="true"
          />
          Active
        </label>
        <ControlSaveButton>{supplier ? "Save supplier" : "Create supplier"}</ControlSaveButton>
      </div>
    </ControlActionForm>
  );
}
