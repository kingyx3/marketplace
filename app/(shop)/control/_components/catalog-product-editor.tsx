import {
  AdminFileField,
  AdminNumberField,
  AdminSelectField,
  AdminTextField,
  AdminTextareaField,
} from "@/app/(shop)/control/_components/admin-form-fields";
import { AdminSubmitButton } from "@/app/(shop)/control/_components/admin-action-form";
import { ControlActionForm } from "@/app/(shop)/control/_components/control-resource-ui";
import {
  setCatalogProductActive,
  uploadCatalogProductImage,
  upsertCatalogProduct,
} from "@/app/actions/catalog";
import { StatusBadge } from "@/app/_components/status-badge";
import type {
  ControlCategoryOption,
  ControlProductRow,
  ControlProductTypeOption,
  ControlSetOption,
} from "@/lib/control-catalog";

export function CatalogProductEditor({
  categories,
  product,
  productTypes,
  sets,
}: {
  categories: ControlCategoryOption[];
  product: ControlProductRow;
  productTypes: ControlProductTypeOption[];
  sets: ControlSetOption[];
}) {
  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-zinc-950">Product details</h2>
          <p className="mt-1 text-sm text-zinc-600">
            Update the customer-facing product, its structured catalog relationships, image,
            publication, and availability.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <StatusBadge tone={product.active ? "success" : "warning"}>
            {product.active ? "Active" : "Archived"}
          </StatusBadge>
          <StatusBadge tone={product.published ? "success" : "neutral"}>
            {product.published ? "Published" : "Not published"}
          </StatusBadge>
        </div>
      </div>

      <ControlActionForm
        action={upsertCatalogProduct}
        className="grid gap-4"
        errorMessage="The product could not be saved. Your entries are still here; review them and try again."
        successMessage="Product saved."
      >
        <input name="productId" type="hidden" value={product.id} />
        <AdminTextField
          defaultValue={product.name}
          example="Pokémon Destined Rivals Booster Box"
          hint="Changing this value regenerates the product slug when saved."
          label="Display name"
          maxLength={160}
          minLength={2}
          name="name"
          required
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <AdminTextField
            defaultValue={product.referenceCode ?? ""}
            example="DRI-BBX-EN"
            hint="Stable internal product reference; normalized to uppercase."
            label="Product reference"
            maxLength={64}
            name="referenceCode"
            pattern="[A-Za-z0-9][A-Za-z0-9._-]{0,63}"
            patternMessage="Reference may use letters, numbers, dots, hyphens, and underscores."
            required
          />
          <AdminTextField
            defaultValue={product.barcode ?? ""}
            example="01987654321098"
            hint="Optional supplier or retail barcode."
            label="Barcode"
            maxLength={64}
            name="barcode"
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <AdminSelectField
            defaultValue={product.categoryId}
            example={categories[0]?.name ?? "Select a category"}
            label="Category"
            name="categoryId"
            options={categories.map((item) => ({
              value: item.id,
              label: item.active ? item.name : `${item.name} (archived)`,
              disabled: !item.active && item.id !== product.categoryId,
            }))}
            required
          />
          <AdminSelectField
            defaultValue={product.setId}
            example={sets[0] ? `${sets[0].name} (${sets[0].code})` : "Select a set"}
            label="Set"
            name="setId"
            options={sets.map((item) => ({
              value: item.id,
              label: `${item.name} (${item.code})${item.active ? "" : " · archived"}`,
              disabled: !item.active && item.id !== product.setId,
            }))}
            required
          />
          <AdminSelectField
            defaultValue={product.productType}
            example={productTypes[0]?.name ?? "Select a type"}
            label="Type"
            name="productType"
            options={productTypes.map((item) => ({
              value: item.code,
              label: item.active ? item.name : `${item.name} (archived)`,
              disabled: !item.active && item.code !== product.productType,
            }))}
            required
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-[7rem_1fr_auto]">
          <AdminTextField
            defaultValue={product.language}
            example="EN"
            hint="Use a 2–8 letter language code."
            label="Language"
            maxLength={8}
            minLength={2}
            name="language"
            pattern="[A-Za-z]{2,8}"
            patternMessage="Language must contain 2–8 letters, such as EN or JP."
            required
          />
          <AdminTextField
            defaultValue={product.imageUrl ?? ""}
            example="https://cdn.example.com/products/destined-rivals.jpg"
            hint="Optional. Uploading a file below replaces this value."
            label="Image URL"
            maxLength={2048}
            name="imageUrl"
            type="url"
          />
          <BooleanField checked={product.active} label="Active" name="active" />
        </div>
        <p className="text-xs text-zinc-500">
          Pricing and publication are managed in their dedicated control domains.
        </p>
        <AdminTextareaField
          defaultValue={product.description ?? ""}
          example="English booster box containing 36 packs."
          hint="Optional customer-facing product details."
          label="Description"
          maxLength={2000}
          name="description"
        />
        <div className="grid gap-4 sm:grid-cols-3">
          <AdminNumberField
            defaultValue={product.packsPerBox ?? undefined}
            example="36"
            label="Packs per box"
            min={1}
            name="packsPerBox"
          />
          <AdminNumberField
            defaultValue={product.cardsPerPack ?? undefined}
            example="10"
            label="Cards per pack"
            min={1}
            name="cardsPerPack"
          />
          <AdminNumberField
            defaultValue={product.weightGrams ?? undefined}
            example="720"
            label="Weight grams"
            min={1}
            name="weightGrams"
          />
        </div>
        <SecondaryButton>Save product</SecondaryButton>
      </ControlActionForm>

      <div className="mt-6 grid gap-4 border-t border-zinc-200 pt-6 sm:grid-cols-[1fr_auto] sm:items-end">
        <ControlActionForm
          action={uploadCatalogProductImage}
          className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end"
          errorMessage="The image could not be uploaded. Choose a supported file and try again."
          successMessage="Product image uploaded."
        >
          <input name="productId" type="hidden" value={product.id} />
          <AdminFileField
            accept="image/jpeg,image/png,image/webp,image/avif"
            example="destined-rivals-booster-box.jpg"
            hint="Choose a JPG, PNG, WebP, or AVIF image up to 6 MB."
            label="Product image"
            name="image"
            required
          />
          <SecondaryButton>Upload image</SecondaryButton>
        </ControlActionForm>
        <ToggleForm
          action={setCatalogProductActive}
          active={product.active}
          id={product.id}
          idName="productId"
          noun="product"
        />
      </div>
    </section>
  );
}

function ToggleForm({
  action,
  active,
  id,
  idName,
  noun,
}: {
  action: (formData: FormData) => Promise<void>;
  active: boolean;
  id: string;
  idName: string;
  noun: string;
}) {
  return (
    <ControlActionForm
      action={action}
      confirmation={{
        title: `${active ? "Archive" : "Restore"} ${noun}?`,
        description: active
          ? `Archiving this ${noun} can remove it from downstream availability.`
          : `Restoring this ${noun} makes it available to downstream workflows again.`,
        confirmLabel: active ? `Archive ${noun}` : `Restore ${noun}`,
        tone: active ? "danger" : "default",
      }}
      errorMessage={`The ${noun} status could not be changed. Please try again.`}
      successMessage={`${noun} ${active ? "archived" : "restored"}.`}
    >
      <input name={idName} type="hidden" value={id} />
      <input name="active" type="hidden" value={active ? "false" : "true"} />
      <DangerButton>{active ? `Archive ${noun}` : `Restore ${noun}`}</DangerButton>
    </ControlActionForm>
  );
}

function BooleanField({ label, name, checked }: { label: string; name: string; checked: boolean }) {
  return (
    <label className="flex items-end gap-2 pb-2 text-xs font-medium text-zinc-600">
      <input name={name} type="hidden" value="false" />
      <input defaultChecked={checked} name={name} type="checkbox" value="true" />
      {label}
    </label>
  );
}

function SecondaryButton({ children }: { children: React.ReactNode }) {
  return (
    <AdminSubmitButton
      className="min-h-10 rounded-md border border-zinc-300 px-3 text-xs font-semibold text-zinc-800 hover:border-emerald-600 hover:text-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
      pendingLabel="Saving…"
    >
      {children}
    </AdminSubmitButton>
  );
}

function DangerButton({ children }: { children: React.ReactNode }) {
  return (
    <AdminSubmitButton
      className="min-h-10 rounded-md border border-rose-200 px-3 text-xs font-semibold text-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
      pendingLabel="Working…"
    >
      {children}
    </AdminSubmitButton>
  );
}
