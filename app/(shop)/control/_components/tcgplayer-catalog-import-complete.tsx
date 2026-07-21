"use client";

import { useActionState } from "react";

import { AdminTextField } from "@/app/(shop)/control/_components/admin-form-fields";
import { ImportSubmitButton } from "@/app/(shop)/control/_components/tcgplayer-import-submit-button";
import { createTcgplayerCatalogProduct } from "@/app/actions/tcgplayer-catalog";
import { initialCatalogProductActionState } from "@/lib/catalog-product-action-state";

const APPROVAL_BOUNDARY_COPY =
  "Local pricing, non-zero inventory, listing approval, and publication remain separate controlled steps.";

export function TcgplayerCatalogImport() {
  const [createState, createAction] = useActionState(
    createTcgplayerCatalogProduct,
    initialCatalogProductActionState,
  );

  return (
    <section className="grid gap-5 rounded-xl border border-indigo-200 bg-indigo-50/60 p-5 shadow-sm sm:p-6">
      <div className="grid gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700">
            Automatic catalog import
          </p>
          <span className="rounded-full border border-indigo-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-indigo-700">
            Unofficial TCGplayer storefront data
          </span>
        </div>
        <h2 className="text-xl font-semibold text-zinc-950">
          Create the product and every available SKU
        </h2>
        <p className="max-w-3xl text-sm leading-6 text-zinc-600">
          Paste one TCGplayer product URL or numeric product ID. The importer
          looks up the complete product record, reuses matching catalog
          hierarchy records, creates missing hierarchy records, and writes the
          product plus every returned physical SKU in one transaction.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <ImportCapability
          description="Matches category, set, and product type or creates the missing records."
          title="Catalog hierarchy"
        />
        <ImportCapability
          description="Imports all returned SKU identifiers, barcodes, packaging data, and source metadata."
          title="Product and SKUs"
        />
        <ImportCapability
          description="Ends on a review screen where the product and each SKU can be opened and edited independently."
          title="Human confirmation"
        />
      </div>

      <form
        action={createAction}
        className="grid gap-4 rounded-xl border border-indigo-200 bg-white p-4 sm:grid-cols-[1fr_auto] sm:items-end sm:p-5"
        data-admin-form="true"
        data-dirty="false"
        onInputCapture={(event) => {
          event.currentTarget.dataset.dirty = "true";
        }}
      >
        <div className="grid gap-3">
          {createState.status === "error" ? (
            <p
              className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800"
              role="alert"
            >
              {createState.message}
            </p>
          ) : null}
          <AdminTextField
            example="https://www.tcgplayer.com/product/242811/... or 242811"
            hint="Only tcgplayer.com product URLs and numeric product IDs are accepted."
            label="TCGplayer product"
            maxLength={300}
            name="tcgplayerReference"
            required
          />
        </div>
        <ImportSubmitButton />
      </form>

      <p className="text-xs leading-5 text-zinc-500">
        {APPROVAL_BOUNDARY_COPY} TCGplayer storefront endpoints are undocumented
        and may change without notice; the manual product form remains available
        below when the provider cannot supply a usable record.
      </p>
    </section>
  );
}

function ImportCapability({
  description,
  title,
}: {
  description: string;
  title: string;
}) {
  return (
    <div className="rounded-lg border border-indigo-100 bg-white/80 p-4">
      <h3 className="text-sm font-semibold text-zinc-950">{title}</h3>
      <p className="mt-1 text-xs leading-5 text-zinc-600">{description}</p>
    </div>
  );
}
