import {
  AdminFileField,
  AdminNumberField,
  AdminSelectField,
  AdminTextField,
  AdminTextareaField,
} from "@/app/(shop)/control/_components/admin-form-fields";
import {
  setCatalogProductActive,
  setCatalogSkuActive,
  uploadCatalogProductImage,
  upsertCatalogProduct,
  upsertCatalogSku,
} from "@/app/actions/catalog";
import { StatusBadge } from "@/app/_components/status-badge";
import { formatMoney } from "@/lib/money";
import type {
  ControlCategoryOption,
  ControlProductRow,
  ControlProductTypeOption,
  ControlSetOption,
  ControlCatalogSku,
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
            Update the customer-facing product, its structured catalog relationships, image, and availability.
          </p>
        </div>
        <StatusBadge tone={product.active ? "success" : "warning"}>
          {product.active ? "Active" : "Archived"}
        </StatusBadge>
      </div>

      <form action={upsertCatalogProduct} className="grid gap-4">
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
            name="imageUrl"
            type="url"
          />
          <BooleanField checked={product.active} label="Active" name="active" />
        </div>
        <AdminTextareaField
          defaultValue={product.description ?? ""}
          example="English booster box containing 36 packs."
          hint="Optional customer-facing product details."
          label="Description"
          maxLength={2000}
          name="description"
        />
        <SecondaryButton>Save product</SecondaryButton>
      </form>

      <div className="mt-6 grid gap-4 border-t border-zinc-200 pt-6 sm:grid-cols-[1fr_auto] sm:items-end">
        <form action={uploadCatalogProductImage} className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <input name="productId" type="hidden" value={product.id} />
          <AdminFileField
            accept="image/*"
            example="destined-rivals-booster-box.jpg"
            hint="Choose a JPG, PNG, WebP, or other supported image file."
            label="Product image"
            name="image"
            required
          />
          <SecondaryButton>Upload image</SecondaryButton>
        </form>
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

export function CatalogSkuManager({ product }: { product: ControlProductRow }) {
  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-zinc-950">SKUs</h2>
          <p className="mt-1 text-sm text-zinc-600">
            Add and maintain the sellable SKU records attached to this product.
          </p>
        </div>
        <StatusBadge tone={product.skus.length > 0 ? "info" : "warning"}>
          {product.skus.length} {product.skus.length === 1 ? "SKU" : "SKUs"}
        </StatusBadge>
      </div>

      <form action={upsertCatalogSku} className={editorClass}>
        <input name="productId" type="hidden" value={product.id} />
        <h3 className="font-semibold text-zinc-950">Add SKU</h3>
        <SkuFields />
        <PrimaryButton>Create SKU</PrimaryButton>
      </form>

      <div className="mt-6 grid gap-4">
        {product.skus.length === 0 ? (
          <EmptyState text="No SKUs have been created for this product." />
        ) : (
          product.skus.map((sku) => <SkuEditor key={sku.skuId} productId={product.id} sku={sku} />)
        )}
      </div>
    </section>
  );
}

function SkuEditor({ productId, sku }: { productId: string; sku: ControlCatalogSku }) {
  return (
    <article className="rounded-lg border border-zinc-200 p-4 sm:p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-zinc-950">{sku.sku}</h3>
          <p className="mt-1 text-xs text-zinc-500">
            {formatMoney(sku.priceCents, sku.currency)}
            {sku.barcode ? ` · ${sku.barcode}` : ""}
          </p>
        </div>
        <StatusBadge tone={sku.skuActive ? "success" : "warning"}>
          {sku.skuActive ? "Active" : "Archived"}
        </StatusBadge>
      </div>

      <form action={upsertCatalogSku} className="grid gap-4">
        <input name="productId" type="hidden" value={productId} />
        <input name="skuId" type="hidden" value={sku.skuId} />
        <SkuFields sku={sku} />
        <SecondaryButton>Save SKU</SecondaryButton>
      </form>

      <div className="mt-3">
        <ToggleForm
          action={setCatalogSkuActive}
          active={sku.skuActive}
          id={sku.skuId}
          idName="skuId"
          noun="SKU"
        />
      </div>
    </article>
  );
}

function SkuFields({ sku }: { sku?: ControlCatalogSku }) {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <AdminTextField
          defaultValue={sku?.sku}
          example="DRI-BBX-EN"
          hint="Use a stable internal identifier; it is normalized to uppercase."
          label="SKU"
          maxLength={64}
          name="sku"
          pattern="[A-Za-z0-9][A-Za-z0-9._-]{0,63}"
          patternMessage="SKU may use letters, numbers, dots, hyphens, and underscores."
          required
        />
        <AdminTextField
          defaultValue={sku?.barcode ?? ""}
          example="01987654321098"
          hint="Optional supplier or retail barcode."
          label="Barcode"
          maxLength={64}
          name="barcode"
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-4">
        <AdminNumberField
          defaultValue={sku?.priceCents}
          example="18900"
          label="Price cents"
          min={1}
          name="priceCents"
          required
        />
        <AdminNumberField
          defaultValue={sku?.msrpCents ?? undefined}
          example="19900"
          label="MSRP cents"
          min={0}
          name="msrpCents"
        />
        <AdminTextField
          defaultValue={sku?.currency ?? "SGD"}
          example="SGD"
          hint="Use a three-letter ISO currency code."
          label="Currency"
          maxLength={3}
          minLength={3}
          name="currency"
          pattern="[A-Za-z]{3}"
          patternMessage="Currency must be a 3-letter code, such as SGD."
          required
        />
        <BooleanField checked={sku?.skuActive ?? true} label="Active" name="active" />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <AdminNumberField
          defaultValue={sku?.packsPerBox ?? undefined}
          example="36"
          label="Packs per box"
          min={0}
          name="packsPerBox"
        />
        <AdminNumberField
          defaultValue={sku?.cardsPerPack ?? undefined}
          example="10"
          label="Cards per pack"
          min={0}
          name="cardsPerPack"
        />
        <AdminNumberField
          defaultValue={sku?.weightGrams ?? undefined}
          example="720"
          label="Weight grams"
          min={0}
          name="weightGrams"
        />
      </div>
    </>
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
    <form action={action}>
      <input name={idName} type="hidden" value={id} />
      <input name="active" type="hidden" value={active ? "false" : "true"} />
      <DangerButton>{active ? `Archive ${noun}` : `Restore ${noun}`}</DangerButton>
    </form>
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

function PrimaryButton({ children }: { children: React.ReactNode }) {
  return (
    <button className="min-h-10 rounded-md bg-zinc-950 px-3 text-xs font-semibold text-white hover:bg-emerald-700">
      {children}
    </button>
  );
}

function SecondaryButton({ children }: { children: React.ReactNode }) {
  return (
    <button className="min-h-10 rounded-md border border-zinc-300 px-3 text-xs font-semibold text-zinc-800 hover:border-emerald-600 hover:text-emerald-700">
      {children}
    </button>
  );
}

function DangerButton({ children }: { children: React.ReactNode }) {
  return (
    <button className="min-h-10 rounded-md border border-rose-200 px-3 text-xs font-semibold text-rose-700">
      {children}
    </button>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <p className="rounded-md border border-dashed border-zinc-300 p-4 text-sm text-zinc-600">
      {text}
    </p>
  );
}

const editorClass = "grid gap-4 rounded-lg border border-zinc-200 bg-zinc-50 p-4 sm:p-5";
