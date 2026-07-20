import {
  AdminNumberField,
  AdminSelectField,
  AdminTextField,
  AdminTextareaField,
} from "@/app/(shop)/control/_components/admin-form-fields";
import { ControlSaveButton } from "@/app/(shop)/control/_components/control-resource-ui";
import { upsertLimitedTimeDeal } from "@/app/actions/admin";

export interface DealRecord {
  id: string;
  code: string;
  sku_id: string;
  title: string;
  description: string | null;
  discount_bps: number;
  visibility: "public" | "members";
  starts_at: string;
  ends_at: string;
  sort_priority: number;
  active: boolean;
}

export interface DealSkuOption {
  id: string;
  sku: string;
  active: boolean;
  productName: string;
  productActive: boolean;
}

export function DealForm({
  deal,
  skus,
  error,
}: {
  deal?: DealRecord;
  skus: DealSkuOption[];
  error?: string;
}) {
  return (
    <form action={upsertLimitedTimeDeal} className="grid gap-5">
      {deal ? <input name="dealId" type="hidden" value={deal.id} /> : null}

      <div className="grid gap-4 md:grid-cols-2">
        <AdminTextField
          defaultValue={deal?.code ?? ""}
          example="destined_rivals_launch"
          externalError={error}
          hint="Use lowercase words separated by underscores or hyphens."
          label="Code"
          maxLength={80}
          name="code"
          pattern="[a-z0-9]+([_-][a-z0-9]+)*"
          patternMessage="Use lowercase words separated by underscores or hyphens."
          required
        />
        <AdminSelectField
          defaultValue={deal?.sku_id ?? ""}
          example={skus[0] ? `${skus[0].productName} — ${skus[0].sku}` : "Select a SKU"}
          hint="Archived products and SKUs remain visible only for existing deals."
          label="SKU"
          name="skuId"
          optionalLabel="Select a SKU"
          options={skus.map((sku) => ({
            value: sku.id,
            label: `${sku.productName} — ${sku.sku}${sku.active && sku.productActive ? "" : " (archived)"}`,
            disabled: (!sku.active || !sku.productActive) && sku.id !== deal?.sku_id,
          }))}
          required
        />
      </div>

      <AdminTextField
        defaultValue={deal?.title ?? ""}
        example="Destined Rivals launch offer"
        hint="Customer-facing promotional title."
        label="Customer-facing title"
        maxLength={160}
        name="title"
        required
      />

      <AdminTextareaField
        defaultValue={deal?.description ?? ""}
        example="Save 10% during launch week."
        hint="Optional customer-facing promotion details."
        label="Description"
        maxLength={500}
        name="description"
      />

      <div className="grid gap-4 md:grid-cols-3">
        <AdminNumberField
          defaultValue={deal?.discount_bps ?? 500}
          example="500"
          hint="500 basis points equals 5%."
          label="Discount (basis points)"
          max={9000}
          min={1}
          name="discountBps"
          required
        />
        <AdminSelectField
          defaultValue={deal?.visibility ?? "members"}
          example="Signed-in members"
          hint="Controls whether discount metadata is visible before sign-in."
          label="Audience"
          name="visibility"
          options={[
            { value: "members", label: "Signed-in members" },
            { value: "public", label: "Public preview" },
          ]}
          required
        />
        <AdminNumberField
          defaultValue={deal?.sort_priority ?? 0}
          example="10"
          hint="Higher values receive stronger merchandising priority."
          label="Sort priority"
          name="sortPriority"
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <AdminTextField
          defaultValue={deal ? singaporeDateTimeInput(deal.starts_at) : ""}
          example="2026-07-25 09:00"
          hint="Singapore time."
          label="Starts (SGT)"
          name="startsAt"
          required
          type="datetime-local"
        />
        <AdminTextField
          defaultValue={deal ? singaporeDateTimeInput(deal.ends_at) : ""}
          example="2026-08-01 23:59"
          hint="Singapore time and must be after the start."
          label="Ends (SGT)"
          name="endsAt"
          required
          type="datetime-local"
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <input name="active" type="hidden" value={deal?.active ? "true" : "false"} />
        <p className="text-sm text-zinc-500">
          {deal?.active
            ? "This active promotion requires pricing approval to save changes."
            : "Save as a draft, then use the separate pricing approval control to activate it."}
        </p>
        <ControlSaveButton>{deal ? "Save deal" : "Create deal"}</ControlSaveButton>
      </div>
    </form>
  );
}

function singaporeDateTimeInput(isoDate: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Singapore",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(isoDate));
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}T${value.hour}:${value.minute}`;
}
