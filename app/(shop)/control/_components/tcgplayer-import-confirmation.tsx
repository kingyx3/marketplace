import Link from "next/link";

import {
  AdminNumberField,
  AdminTextField,
} from "@/app/(shop)/control/_components/admin-form-fields";
import { CatalogProductDetailsEditor } from "@/app/(shop)/control/_components/catalog-product-details-editor";
import {
  ControlActionForm,
  ControlPrimaryLink,
  ControlSaveButton,
} from "@/app/(shop)/control/_components/control-resource-ui";
import { upsertCatalogSku } from "@/app/actions/catalog";
import { StatusBadge } from "@/app/_components/status-badge";
import type {
  ControlCatalogSku,
  ControlCategoryOption,
  ControlProductRow,
  ControlProductTypeOption,
  ControlSetOption,
} from "@/lib/control-catalog";

export function TcgplayerImportConfirmation({
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
    <div className="grid gap-6">
      <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
              Import successful
            </p>
            <h2 className="mt-1 text-xl font-semibold text-zinc-950">
              Product and SKU records created
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-700">
              Review the imported product and each SKU below. Every section is
              independent, so an administrator can open and save only the
              record that needs a correction.
            </p>
          </div>
          <StatusBadge tone="success">Created</StatusBadge>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Summary label="Product" value={product.name} />
        <Summary
          label="Hierarchy"
          value={`${product.categoryName ?? "Uncategorized"} · ${product.setName ?? "No set"}`}
        />
        <Summary
          label="SKUs created"
          value={`${product.skus.length} ${product.skus.length === 1 ? "SKU" : "SKUs"}`}
        />
        <Summary
          label="Storefront state"
          value={product.published ? "Published" : "Not published"}
        />
      </section>

      <details
        className="group rounded-xl border border-zinc-200 bg-white shadow-sm"
        open
      >
        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-5 sm:p-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700">
              Product record
            </p>
            <h2 className="mt-1 text-lg font-semibold text-zinc-950">
              {product.name}
            </h2>
            <p className="mt-1 text-sm text-zinc-600">
              {product.productType} · {product.language} · /{product.slug}
            </p>
          </div>
          <span className="text-sm font-semibold text-indigo-700 group-open:hidden">
            Open and edit
          </span>
          <span className="hidden text-sm font-semibold text-zinc-500 group-open:inline">
            Close section
          </span>
        </summary>
        <div className="border-t border-zinc-200 p-4 sm:p-6">
          <CatalogProductDetailsEditor
            categories={categories}
            product={product}
            productTypes={productTypes}
            sets={sets}
          />
        </div>
      </details>

      <section className="grid gap-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700">
              Imported SKU records
            </p>
            <h2 className="mt-1 text-xl font-semibold text-zinc-950">
              Review each SKU independently
            </h2>
            <p className="mt-1 max-w-3xl text-sm text-zinc-600">
              Open only the SKU that needs adjustment. Saving one SKU does not
              submit or overwrite the other imported SKU sections.
            </p>
          </div>
          <StatusBadge tone={product.skus.length > 0 ? "info" : "warning"}>
            {product.skus.length} {product.skus.length === 1 ? "SKU" : "SKUs"}
          </StatusBadge>
        </div>

        {product.skus.length === 0 ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
            <p className="font-semibold">TCGplayer returned no SKU variants.</p>
            <p className="mt-1 leading-6">
              The product was created successfully. Add its physical SKU from
              the standard product workspace.
            </p>
            <Link
              className="mt-3 inline-flex min-h-10 items-center justify-center rounded-md border border-amber-300 bg-white px-4 font-semibold hover:border-amber-500"
              href={`/control/catalog/products/${product.id}#skus`}
            >
              Add a SKU
            </Link>
          </div>
        ) : (
          <div className="grid gap-4">
            {product.skus.map((sku, index) => (
              <ImportedSkuSection
                index={index}
                key={sku.skuId}
                productId={product.id}
                sku={sku}
              />
            ))}
          </div>
        )}
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6">
        <h2 className="text-lg font-semibold text-zinc-950">Continue setup</h2>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-zinc-600">
          The import intentionally leaves local selling prices at zero,
          inventory at zero, and publication off. Continue through the normal
          controlled workflow before the product can appear to customers.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <ControlPrimaryLink href={`/control/catalog/products/${product.id}`}>
            Open product workflow
          </ControlPrimaryLink>
          <Link
            className="inline-flex min-h-11 items-center justify-center rounded-md border border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-800 hover:border-emerald-600 hover:text-emerald-700"
            href="/control/pricing"
          >
            Continue to pricing
          </Link>
          <Link
            className="inline-flex min-h-11 items-center justify-center rounded-md border border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-800 hover:border-emerald-600 hover:text-emerald-700"
            href="/control/supply"
          >
            Continue to supply
          </Link>
        </div>
      </section>
    </div>
  );
}

function ImportedSkuSection({
  index,
  productId,
  sku,
}: {
  index: number;
  productId: string;
  sku: ControlCatalogSku;
}) {
  return (
    <details className="group rounded-xl border border-zinc-200 bg-white shadow-sm">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-5 sm:p-6">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              SKU {index + 1}
            </p>
            <StatusBadge tone={sku.skuActive ? "success" : "warning"}>
              {sku.skuActive ? "Active" : "Archived"}
            </StatusBadge>
          </div>
          <h3 className="mt-1 font-semibold text-zinc-950">{sku.sku}</h3>
          <p className="mt-1 text-sm text-zinc-600">
            {sku.barcode ? `Barcode ${sku.barcode}` : "No barcode"}
            {sku.packsPerBox ? ` · ${sku.packsPerBox} packs per box` : ""}
            {sku.cardsPerPack ? ` · ${sku.cardsPerPack} cards per pack` : ""}
          </p>
        </div>
        <span className="text-sm font-semibold text-indigo-700 group-open:hidden">
          Open and edit
        </span>
        <span className="hidden text-sm font-semibold text-zinc-500 group-open:inline">
          Close section
        </span>
      </summary>

      <div className="border-t border-zinc-200 p-5 sm:p-6">
        <ControlActionForm
          action={upsertCatalogSku}
          className="grid gap-4"
          errorMessage="This imported SKU could not be saved. Your entries are still here; review them and try again."
          successMessage="Imported SKU saved."
        >
          <input name="productId" type="hidden" value={productId} />
          <input name="skuId" type="hidden" value={sku.skuId} />
          <div className="grid gap-4 sm:grid-cols-2">
            <AdminTextField
              defaultValue={sku.sku}
              example="TCG-242811-987"
              hint="Stable local identifier generated from the TCGplayer product and SKU IDs."
              label="SKU"
              maxLength={64}
              name="sku"
              pattern="[A-Za-z0-9][A-Za-z0-9._-]{0,63}"
              patternMessage="SKU may use letters, numbers, dots, hyphens, and underscores."
              required
            />
            <AdminTextField
              defaultValue={sku.barcode ?? ""}
              example="01987654321098"
              hint="Optional supplier or retail barcode."
              label="Barcode"
              maxLength={64}
              name="barcode"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <AdminNumberField
              defaultValue={sku.packsPerBox ?? undefined}
              example="36"
              label="Packs per box"
              min={1}
              name="packsPerBox"
            />
            <AdminNumberField
              defaultValue={sku.cardsPerPack ?? undefined}
              example="10"
              label="Cards per pack"
              min={1}
              name="cardsPerPack"
            />
            <AdminNumberField
              defaultValue={sku.weightGrams ?? undefined}
              example="720"
              label="Weight grams"
              min={1}
              name="weightGrams"
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-zinc-200 bg-zinc-50 p-4">
            <label className="flex min-h-11 items-center gap-2 text-sm font-medium text-zinc-700">
              <input name="active" type="hidden" value="false" />
              <input
                defaultChecked={sku.skuActive}
                name="active"
                type="checkbox"
                value="true"
              />
              Active internal SKU
            </label>
            <ControlSaveButton pendingLabel="Saving SKU…">
              Save this SKU
            </ControlSaveButton>
          </div>
        </ControlActionForm>
      </div>
    </details>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
        {label}
      </p>
      <p className="mt-2 break-words font-semibold text-zinc-950">{value}</p>
    </div>
  );
}
