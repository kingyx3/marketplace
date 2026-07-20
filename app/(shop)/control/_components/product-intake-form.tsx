"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import {
  AdminSelectField,
  AdminTextField,
  AdminTextareaField,
} from "@/app/(shop)/control/_components/admin-form-fields";
import { createCatalogProduct } from "@/app/actions/catalog";
import { initialCatalogProductActionState } from "@/lib/catalog-product-action-state";
import { slugFromName } from "@/lib/catalog-identifiers";

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
  existingSlugs = [],
}: {
  categories: CatalogCategoryOption[];
  productTypes: CatalogProductTypeOption[];
  sets: CatalogSetOption[];
  existingSlugs?: string[];
}) {
  const [state, action] = useActionState(createCatalogProduct, initialCatalogProductActionState);
  const initialCategoryId = categories[0]?.id ?? "";
  const initialCategoryHasSets = sets.some((set) => set.categoryId === initialCategoryId);
  const [displayName, setDisplayName] = useState("");
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
  const generatedSlug = slugFromName(displayName);
  const duplicateSlug = generatedSlug !== "" && existingSlugs.includes(generatedSlug);

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
        <div>
          <h3 className="font-semibold text-zinc-950">Product</h3>
          <p className="mt-1 text-xs text-zinc-500">
            The display name is customer-facing. Its URL slug is generated automatically and cannot
            duplicate another product slug.
          </p>
        </div>

        <AdminTextField
          example="Pokémon Destined Rivals Booster Box"
          externalError={
            state.field === "name" || state.field === "productIdentity" ? state.message : undefined
          }
          hint="Use the exact customer-facing title. The slug updates below as you type."
          label="Display name"
          maxLength={160}
          minLength={2}
          name="name"
          onValueChange={setDisplayName}
          required
          value={displayName}
        />

        <div
          className={`rounded-md border px-3 py-2 text-xs ${
            duplicateSlug
              ? "border-rose-200 bg-rose-50 text-rose-800"
              : "border-zinc-200 bg-zinc-50 text-zinc-600"
          }`}
          role={duplicateSlug ? "alert" : "status"}
        >
          <span className="font-semibold">Generated slug:</span>{" "}
          {generatedSlug ? `/${generatedSlug}` : "Enter a display name to preview the slug."}
          {duplicateSlug ? " This slug is already in use; choose a distinct display name." : ""}
        </div>

        <div className="grid gap-4 rounded-lg border border-zinc-200 bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h4 className="text-sm font-semibold text-zinc-950">Product type</h4>
              <p className="mt-1 text-xs text-zinc-500">
                Choose a reusable type or add one inline.
              </p>
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
            <AdminSelectField
              example="Booster box"
              externalError={state.field === "productType" ? state.message : undefined}
              label="Type"
              name="productType"
              onValueChange={setProductType}
              options={productTypes.map((type) => ({ value: type.code, label: type.name }))}
              required
              value={productType}
            />
          ) : (
            <AdminTextField
              example="Premium collection"
              externalError={state.field === "productType" ? state.message : undefined}
              hint="A reusable dropdown code is generated automatically from this name."
              label="New type name"
              maxLength={160}
              minLength={2}
              name="newProductTypeName"
              required
            />
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <AdminTextField
            autoCapitalize="characters"
            example="EN"
            externalError={state.field === "productIdentity" ? state.message : undefined}
            hint="Use a 2–8 letter language code."
            label="Language"
            maxLength={8}
            minLength={2}
            name="language"
            pattern="[A-Za-z]{2,8}"
            patternMessage="Language must contain 2–8 letters, such as EN or JP."
            required
            defaultValue="EN"
          />
          <AdminTextField
            example="https://cdn.example.com/products/destined-rivals.jpg"
            hint="Optional. You can also upload an image after creating the product."
            label="Image URL"
            maxLength={2048}
            name="imageUrl"
            type="url"
          />
        </div>
        <AdminTextareaField
          example="English booster box containing 36 packs."
          hint="Optional customer-facing product details."
          label="Description"
          maxLength={2000}
          name="description"
        />
      </section>

      <section className="grid gap-5 rounded-xl border border-zinc-200 bg-zinc-50 p-4">
        <div className="grid gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
                Step 1
              </p>
              <h3 className="font-semibold text-zinc-950">Category</h3>
            </div>
            <div className="flex rounded-md border border-zinc-300 bg-white p-1 text-xs font-semibold">
              <ModeButton
                active={categoryMode === "existing"}
                disabled={categories.length === 0}
                onClick={() => selectCategoryMode("existing")}
              >
                Existing
              </ModeButton>
              <ModeButton active={categoryMode === "new"} onClick={() => selectCategoryMode("new")}>
                Add category
              </ModeButton>
            </div>
          </div>

          <input name="categoryMode" type="hidden" value={categoryMode} />
          {categoryMode === "existing" ? (
            <AdminSelectField
              example="Pokémon"
              externalError={state.field === "category" ? state.message : undefined}
              label="Category"
              name="categoryId"
              onValueChange={(nextCategoryId) => {
                setCategoryId(nextCategoryId);
                setSetId("");
                setSetMode(
                  sets.some((set) => set.categoryId === nextCategoryId) ? "existing" : "new"
                );
              }}
              options={categories.map((category) => ({
                value: category.id,
                label: category.name,
              }))}
              required
              value={categoryId}
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <AdminTextField
                example="Pokémon"
                externalError={state.field === "categorySlug" ? state.message : undefined}
                hint="The category slug is generated automatically from this name."
                label="Category name"
                maxLength={160}
                minLength={2}
                name="newCategoryName"
                required
              />
              <AdminTextField
                example="The Pokémon Company"
                hint="Optional organization that publishes the category."
                label="Publisher"
                maxLength={160}
                name="newCategoryPublisher"
              />
            </div>
          )}
        </div>

        <div className="grid gap-4 border-t border-zinc-200 pt-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
                Step 2
              </p>
              <h3 className="font-semibold text-zinc-950">Set</h3>
              <p className="mt-1 text-xs text-zinc-500">
                Required. The set remains a structured relationship and does not overwrite the
                display name.
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
            <AdminSelectField
              example="Destined Rivals (DRI)"
              externalError={state.field === "set" ? state.message : undefined}
              label="Set"
              name="setId"
              onValueChange={setSetId}
              optionalLabel="Select a set"
              options={visibleSets.map((set) => ({
                value: set.id,
                label: `${set.name} (${set.code})`,
              }))}
              required
              value={setId}
            />
          ) : null}

          {setMode === "new" ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <AdminTextField
                example="Destined Rivals"
                externalError={state.field === "setCode" ? state.message : undefined}
                hint="The reusable set code is generated automatically from this name."
                label="Set name"
                maxLength={160}
                minLength={2}
                name="newSetName"
                required
              />
              <AdminTextField
                example="2026-08-15"
                hint="Optional planned or confirmed release date."
                label="Release date"
                name="newSetReleaseDate"
                type="date"
              />
              <AdminSelectField
                defaultValue="announced"
                example="Announced"
                label="Status"
                name="newSetStatus"
                options={[
                  { value: "announced", label: "Announced" },
                  { value: "preorder_open", label: "Preorder open" },
                  { value: "preorder_closed", label: "Preorder closed" },
                  { value: "released", label: "Released" },
                  { value: "out_of_print", label: "Out of print" },
                ]}
                required
              />
            </div>
          ) : null}
        </div>
      </section>

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="grid gap-2">
          <div className="flex flex-wrap gap-5">
            <label className="flex min-h-11 items-center gap-2 text-sm font-medium text-zinc-700">
              <input name="active" type="hidden" value="false" />
              <input defaultChecked name="active" type="checkbox" value="true" />
              Active
            </label>
          </div>
          <p className="max-w-2xl text-xs text-zinc-500">
            New products start as internal drafts. Add a physical SKU, price it, configure supply,
            and complete the listing before publication.
          </p>
        </div>
        <SubmitButton disabled={duplicateSlug || generatedSlug === ""} />
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

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      className="min-h-11 rounded-md bg-zinc-950 px-5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-zinc-400"
      disabled={pending || disabled}
    >
      {pending ? "Creating…" : "Create product"}
    </button>
  );
}
