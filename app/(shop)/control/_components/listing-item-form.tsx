import {
  AdminNumberField,
  AdminTextField,
  AdminTextareaField,
} from "@/app/(shop)/control/_components/admin-form-fields";
import { ControlSaveButton } from "@/app/(shop)/control/_components/control-resource-ui";
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
    <form action={upsertListingItem} className="grid gap-5">
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

      <div className="flex flex-wrap gap-6 text-sm font-medium text-zinc-700">
        <label className="flex min-h-11 items-center gap-2">
          <input name="featured" type="hidden" value="false" />
          <input defaultChecked={listing?.featured ?? false} name="featured" type="checkbox" value="true" />
          Featured
        </label>
        <label className="flex min-h-11 items-center gap-2">
          <input name="published" type="hidden" value="false" />
          <input defaultChecked={listing?.published ?? true} name="published" type="checkbox" value="true" />
          Published
        </label>
      </div>

      <div className="flex justify-end">
        <ControlSaveButton>Save listing</ControlSaveButton>
      </div>
    </form>
  );
}
