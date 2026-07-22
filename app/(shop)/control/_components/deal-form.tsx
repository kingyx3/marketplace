import {
  AdminNumberField,
  AdminSelectField,
  AdminTextField,
  AdminTextareaField,
} from "@/app/(shop)/control/_components/admin-form-fields";
import { DealPricingFields } from "@/app/(shop)/control/_components/deal-pricing-fields";
import {
  ControlActionForm,
  ControlSaveButton,
} from "@/app/(shop)/control/_components/control-resource-ui";
import { upsertLimitedTimeDeal } from "@/app/actions/admin";

export interface DealRecord {
  id: string;
  code: string;
  product_id: string;
  title: string;
  description: string | null;
  discount_bps: number;
  deal_price_cents: number;
  visibility: "public" | "members";
  starts_at: string;
  ends_at: string;
  sort_priority: number;
  active: boolean;
}

export interface DealProductOption {
  id: string;
  referenceCode: string;
  active: boolean;
  productName: string;
  productActive: boolean;
  priceCents: number;
  currency: string;
}

export function DealForm({
  deal,
  products,
  error,
}: {
  deal?: DealRecord;
  products: DealProductOption[];
  error?: string;
}) {
  return (
    <ControlActionForm
      action={upsertLimitedTimeDeal}
      className="grid gap-5"
      errorMessage="The promotion could not be saved. Your entries are still here; review them and try again."
      successHref="/control/pricing/deals"
      successMessage={deal ? "Promotion updated." : "Promotion created as a draft."}
    >
      {deal ? <input name="dealId" type="hidden" value={deal.id} /> : null}

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

      <DealPricingFields
        dealPriceCents={deal?.deal_price_cents}
        selectedProductId={deal?.product_id}
        products={products}
      />

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
        example="Limited launch pricing while stocks last."
        hint="Optional customer-facing promotion details."
        label="Description"
        maxLength={500}
        name="description"
      />

      <div className="grid gap-4 md:grid-cols-2">
        <AdminSelectField
          defaultValue={deal?.visibility ?? "members"}
          example="Signed-in members"
          hint="Controls whether deal metadata is visible before sign-in."
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
    </ControlActionForm>
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
