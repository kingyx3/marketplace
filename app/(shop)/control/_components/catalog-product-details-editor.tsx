import { CatalogProductSaveForm } from "@/app/(shop)/control/_components/catalog-product-save-form";
import {
  ControlActionForm,
  ControlDangerButton,
} from "@/app/(shop)/control/_components/control-resource-ui";
import { ProductImageUploader } from "@/app/(shop)/control/_components/product-image-uploader";
import { setCatalogProductActive } from "@/app/actions/catalog";
import { StatusBadge } from "@/app/_components/status-badge";
import type {
  ControlCategoryOption,
  ControlProductRow,
  ControlProductTypeOption,
  ControlSetOption,
} from "@/lib/control-catalog";

export function CatalogProductDetailsEditor({
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
            Maintain product identity, structured catalog relationships, media, and lifecycle.
            Pricing and storefront publication are managed separately.
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

      <CatalogProductSaveForm
        categories={categories}
        product={product}
        productTypes={productTypes}
        sets={sets}
      />

      <div className="mt-6 grid gap-4 border-t border-zinc-200 pt-6 sm:grid-cols-[1fr_auto] sm:items-end">
        <ProductImageUploader productId={product.id} />
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
          ? `Archiving this ${noun} removes it from active administrative choices and may affect customer availability.`
          : `Restoring this ${noun} makes it available to downstream administrative workflows again.`,
        confirmLabel: active ? `Archive ${noun}` : `Restore ${noun}`,
        tone: active ? "danger" : "default",
      }}
      errorMessage={`The ${noun} status could not be changed. Please try again.`}
      successMessage={`${noun[0].toUpperCase()}${noun.slice(1)} ${active ? "archived" : "restored"}.`}
    >
      <input name={idName} type="hidden" value={id} />
      <input name="active" type="hidden" value={active ? "false" : "true"} />
      <ControlDangerButton pendingLabel={active ? "Archiving…" : "Restoring…"}>
        {active ? `Archive ${noun}` : `Restore ${noun}`}
      </ControlDangerButton>
    </ControlActionForm>
  );
}
