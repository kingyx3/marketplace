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
import { upsertListingItem } from "@/app/actions/admin";

export interface ListingItemRecord {
  id: string;
  title_override: string | null;
  badge_label: string | null;
  tags: string[] | null;
  max_per_customer: number | null;
  preorder_reserve: number;
  sort_priority: number;
  featured: boolean;
  availability_mode: "available_now" | "preorder" | "coming_soon" | "unavailable";
  order_open_at: string | null;
  order_close_at: string | null;
  release_date: string | null;
  published: boolean;
}

export interface ListingProductRecord {
  id: string;
  name: string;
  slug: string;
  active: boolean;
}

export function ListingItemForm({
  listing,
  product,
}: {
  listing: ListingItemRecord | null;
  product: ListingProductRecord;
}) {
  return (
    <ControlActionForm
      action={upsertListingItem}
      className="grid gap-5"
      errorMessage="The listing could not be saved. Your entries are still here; review them and try again."
      successMessage="Listing configuration saved."
    >
      <input name="productId" type="hidden" value={product.id} />

      <div className="grid gap-4 md:grid-cols-2">
        <AdminTextField
          defaultValue={listing?.title_override ?? ""}
          example={product.name}
          hint="Optional storefront title override."
          label="Title override"
          maxLength={180}
          name="titleOverride"
        />
        <AdminTextField
          defaultValue={listing?.badge_label ?? ""}
          example="Featured"
          hint="Optional short storefront badge."
          label="Badge"
          maxLength={80}
          name="badgeLabel"
        />
      </div>

      <AdminTextareaField
        defaultValue={(listing?.tags ?? []).join(", ")}
        example="Preorder, Limit 2"
        hint="Comma-separated merchandising tags."
        label="Tags"
        maxLength={800}
        name="tags"
      />

      <div className="grid gap-4 md:grid-cols-3">
        <AdminNumberField
          defaultValue={listing?.max_per_customer ?? ""}
          example="2"
          hint="Optional per-customer purchase limit."
          label="Max per customer"
          min={1}
          name="maxPerCustomer"
        />
        <AdminNumberField
          defaultValue={listing?.preorder_reserve ?? 0}
          example="5"
          hint="Quantity reserved from general preorder availability."
          label="Preorder reserve"
          min={0}
          name="preorderReserve"
        />
        <AdminNumberField
          defaultValue={listing?.sort_priority ?? 0}
          example="10"
          hint="Higher values receive stronger storefront priority."
          label="Sort priority"
          name="sortPriority"
        />
      </div>

      <fieldset className="grid gap-4 rounded-lg border border-zinc-200 p-4">
        <legend className="px-1 text-sm font-semibold text-zinc-950">Availability</legend>
        <p className="text-sm leading-6 text-zinc-600">
          Define when customers can order. This state is independent from the final publication
          approval.
        </p>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <AdminSelectField
            defaultValue={listing?.availability_mode ?? "unavailable"}
            example="Select availability"
            label="Selling mode"
            name="availabilityMode"
            options={[
              { value: "unavailable", label: "Unavailable" },
              { value: "available_now", label: "Available now" },
              { value: "preorder", label: "Preorder" },
              { value: "coming_soon", label: "Coming soon" },
            ]}
            required
          />
          <AdminTextField
            defaultValue={localDateTime(listing?.order_open_at)}
            example="Optional opening time"
            hint="Singapore time. Leave blank for immediate access."
            label="Orders open"
            name="orderOpenAt"
            type="datetime-local"
          />
          <AdminTextField
            defaultValue={localDateTime(listing?.order_close_at)}
            example="Optional closing time"
            hint="Singapore time. Must be after the opening time."
            label="Orders close"
            name="orderCloseAt"
            type="datetime-local"
          />
          <AdminTextField
            defaultValue={listing?.release_date ?? ""}
            example="Optional release date"
            label="Release date"
            name="releaseDate"
            type="date"
          />
        </div>
      </fieldset>

      <div className="flex flex-wrap gap-6 text-sm font-medium text-zinc-700">
        <label className="flex min-h-11 items-center gap-2">
          <input name="featured" type="hidden" value="false" />
          <input
            defaultChecked={listing?.featured ?? false}
            name="featured"
            type="checkbox"
            value="true"
          />
          Featured
        </label>
        <p className="flex min-h-11 items-center text-zinc-500">
          Publication is reviewed and approved separately below.
        </p>
      </div>

      <div className="flex justify-end">
        <ControlSaveButton>Save listing</ControlSaveButton>
      </div>
    </ControlActionForm>
  );
}

function localDateTime(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const singapore = new Date(date.getTime() + 8 * 60 * 60 * 1000);
  return singapore.toISOString().slice(0, 16);
}
