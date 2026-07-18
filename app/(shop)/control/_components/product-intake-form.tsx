"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { createCatalogProduct } from "@/app/actions/catalog";
import { initialCatalogProductActionState } from "@/lib/catalog-product-action-state";

export interface CatalogCategoryOption {
  id: string;
  name: string;
  slug: string;
}

export interface CatalogSetOption {
  id: string;
  categoryId: string;
  name: string;
  code: string;
}

export interface CatalogProductTypeOption {
  code: string;
  name: string;
}

type CategoryMode = "existing" | "new";
type SetMode = "existing" | "new";
type ProductTypeMode = "existing" | "new";

export function ProductIntakeForm({
  categories,
  productTypes,
  sets,
}: {
  categories: CatalogCategoryOption[];
  productTypes: CatalogProductTypeOption[];
  sets: CatalogSetOption[];
}) {
  const [state, action] = useActionState(createCatalogProduct, initialCatalogProductActionState);
  const initialCategoryId = categories[0]?.id ?? "";
  const initialCategoryHasSets = sets.some((set) => set.categoryId === initialCategoryId);
  const [categoryMode, setCategoryMode] = useState<CategoryMode>(
    categories.length === 0 ? "new" : "existing"
  );
  const [categoryId, setCategoryId] = useState(initialCategoryId);
  const [setMode, setSetMode] = useState<SetMode>(initialCategoryHasSets ? "existing" : "new");
  const [setId, setSetId] = useState("");
  const [productTypeMode, setProductTypeMode] = useState<ProductTypeMode>(
    productTypes.length === 0 ? "new" : "existing"
  );
  const [productType, setProductType] = useState(productTypes[0]?.code ?? "");
  const visibleSets = sets.filter((set) => set.categoryId === categoryId);

  function selectCategoryMode(mode: CategoryMode) {
    setCategoryMode(mode);
    setSetId("");
    if (mode === "new") {
      setSetMode("new");
      return;
    }
    setSetMode(visibleSets.length > 0 ? "existing" : "new");
  }

  return (
    <form action={action} className="grid gap-5">
      {state.status !== "idle" ? (
        <div
          className={
            state.status === "success"
              ? "rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900"
              : "rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950"
          }
          role={state.status === "error" ? "alert" : "status"}
        >
          {state.message}
        </div>
      ) : null}

      <section className="grid gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold text-zinc-950">Product</h3>
            <p className="mt-1 text-xs text-zinc-500">
              The display name and slug are generated from category, set, type, and language.
            </p>
          </div>
          <span className="text-xs text-zinc-500">No product name required</span>
        </div>

        <div className="grid gap-4 rounded-lg border border-zinc-200 bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h4 className="text-sm font-semibold text-zinc-950">Product type</h4>
              <p className="mt-1 text-xs text-zinc-500">Choose a reusable type or add one inline.</p>
            </div>
            <div className="flex rounded-md border border-zinc-300 bg-zinc-50 p-1 text-xs font-semibold">
              <ModeButton
                active={productTypeMode === "existing"}
                disabled={productTypes.length === 0}
                onClick={() => setProductTypeMode("existing")}
              >
                Existing
              </ModeButton>
              <ModeButton
                active={productTypeMode === "new"}
                onClick={() => setProductTypeMode("new")}
              >
                Add type
              </ModeButton>
            </div>
          </div>
          <input name="productTypeMode" type="hidden" value={productTypeMode} />
          {productTypeMode === "existing" ? (
            <Field label="Type" error={state.field === "productType"}>
              <select
                className={inputClass}
                name="productType"
                onChange={(event) => setProductType(event.target.value)}
                required
                value={productType}
              >
                {productTypes.map((type) => (
                  <option key={type.code} value={type.code}>
                    {type.name}
                  </option>
                ))}
              </select>
            </Field>
          ) : (
            <Field label="New type name" error={state.field === "productType"}>
              <input className={inputClass} maxLength={160} name="newProductTypeName" required />
              <IdentifierHint>
                A reusable dropdown code is generated automatically from this name.
              </IdentifierHint>
            </Field>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Language" error={state.field === "productIdentity"}>
            <input className={inputClass} defaultValue="EN" maxLength={8} name="language" required />
          </Field>
          <Field label="Image URL">
            <input className={inputClass} name="imageUrl" type="url" />
          </Field>
        </div>
        <Field label="Description">
          <textarea className={`${inputClass} min-h-24 py-2`} maxLength={2000} name="description" />
        </Field>
      </section>

      <section className="grid gap-5 rounded-xl border border-zinc-200 bg-zinc-50 p-4">
        <div className="grid gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Step 1</p>
              <h3 className="font-semibold text-zinc-950">Category</h3>
            </div>
            <div className="flex rounded-md border border-zinc-300 bg-white p-1 text-xs font-semibold">
              <button
                className={`min-h-9 rounded px-3 ${categoryMode === "existing" ? "bg-zinc-950 text-white" : "text-zinc-600"}`}
                disabled={categories.length === 0}
                onClick={() => selectCategoryMode("existing")}
                type="button"
              >
                Existing
              </button>
              <button
                className={`min-h-9 rounded px-3 ${categoryMode === "new" ? "bg-zinc-950 text-white" : "text-zinc-600"}`}
                onClick={() => selectCategoryMode("new")}
                type="button"
              >
                Add category
              </button>
            </div>
          </div>

          <input name="categoryMode" type="hidden" value={categoryMode} />
          {categoryMode === "existing" ? (
            <Field label="Category" error={state.field === "category"}>
              <select
                className={inputClass}
                name="categoryId"
                onChange={(event) => {
                  const nextCategoryId = event.target.value;
                  setCategoryId(nextCategoryId);
                  setSetId("");
                  setSetMode(
                    sets.some((set) => set.categoryId === nextCategoryId) ? "existing" : "new"
                  );
                }}
                required
                value={categoryId}
              >
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </Field>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Category name" error={state.field === "categorySlug"}>
                <input className={inputClass} maxLength={160} name="newCategoryName" required />
                <IdentifierHint>Slug is generated automatically from the category name.</IdentifierHint>
              </Field>
              <Field label="Publisher">
                <input className={inputClass} maxLength={160} name="newCategoryPublisher" />
              </Field>
            </div>
          )}
        </div>

        <div className="grid gap-4 border-t border-zinc-200 pt-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Step 2</p>
              <h3 className="font-semibold text-zinc-950">Set</h3>
              <p className="mt-1 text-xs text-zinc-500">
                Required. Products are identified by their set, type, and language.
              </p>
            </div>
            <div className="flex flex-wrap rounded-md border border-zinc-300 bg-white p-1 text-xs font-semibold">
              <ModeButton
                active={setMode === "existing"}
                disabled={categoryMode !== "existing" || visibleSets.length === 0}
                onClick={() => setSetMode("existing")}
              >
                Existing
              </ModeButton>
              <ModeButton
                active={setMode === "new"}
                onClick={() => {
                  setSetMode("new");
                  setSetId("");
                }}
              >
                Add set
              </ModeButton>
            </div>
          </div>

          <input name="setMode" type="hidden" value={setMode} />
          {setMode === "existing" ? (
            <Field label="Set" error={state.field === "set"}>
              <select
                className={inputClass}
                name="setId"
                onChange={(event) => setSetId(event.target.value)}
                required
                value={setId}
              >
                <option value="">Select a set</option>
                {visibleSets.map((set) => (
                  <option key={set.id} value={set.id}>
                    {set.name} ({set.code})
                  </option>
                ))}
              </select>
            </Field>
          ) : null}

          {setMode === "new" ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Set name" error={state.field === "setCode"}>
                <input className={inputClass} maxLength={160} name="newSetName" required />
                <IdentifierHint>Code is generated automatically from the set name.</IdentifierHint>
              </Field>
              <Field label="Release date">
                <input className={inputClass} name="newSetReleaseDate" type="date" />
              </Field>
              <Field label="Status">
                <select className={inputClass} defaultValue="announced" name="newSetStatus">
                  <option value="announced">Announced</option>
                  <option value="preorder_open">Preorder open</option>
                  <option value="preorder_closed">Preorder closed</option>
                  <option value="released">Released</option>
                  <option value="out_of_print">Out of print</option>
                </select>
              </Field>
            </div>
          ) : null}
        </div>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <label className="flex min-h-11 items-center gap-2 text-sm font-medium text-zinc-700">
          <input name="active" type="hidden" value="false" />
          <input defaultChecked name="active" type="checkbox" value="true" />
          Active
        </label>
        <SubmitButton />
      </div>
    </form>
  );
}

function ModeButton({
  active,
  children,
  disabled = false,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={`min-h-9 rounded px-3 ${active ? "bg-zinc-950 text-white" : "text-zinc-600"} disabled:cursor-not-allowed disabled:text-zinc-300`}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      className="min-h-11 rounded-md bg-zinc-950 px-5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:bg-zinc-400"
      disabled={pending}
    >
      {pending ? "Creating…" : "Create product"}
    </button>
  );
}

function Field({
  children,
  label,
  error = false,
}: {
  children: React.ReactNode;
  label: string;
  error?: boolean;
}) {
  return (
    <label className={`grid gap-1 text-sm font-medium ${error ? "text-rose-700" : "text-zinc-700"}`}>
      {label}
      {children}
    </label>
  );
}

function IdentifierHint({ children }: { children: React.ReactNode }) {
  return <span className="text-xs font-normal text-zinc-500">{children}</span>;
}

const inputClass =
  "min-h-11 min-w-0 rounded-md border border-zinc-300 bg-white px-3 text-base text-zinc-950 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 sm:text-sm";
