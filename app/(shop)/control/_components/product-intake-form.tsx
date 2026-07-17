"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import {
  createCatalogProduct,
  initialCatalogProductActionState,
} from "@/app/actions/catalog";

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

type CategoryMode = "existing" | "new";
type SetMode = "none" | "existing" | "new";

export function ProductIntakeForm({
  categories,
  sets,
}: {
  categories: CatalogCategoryOption[];
  sets: CatalogSetOption[];
}) {
  const [state, action] = useActionState(createCatalogProduct, initialCatalogProductActionState);
  const [categoryMode, setCategoryMode] = useState<CategoryMode>(
    categories.length === 0 ? "new" : "existing"
  );
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? "");
  const [setMode, setSetMode] = useState<SetMode>("none");
  const [setId, setSetId] = useState("");
  const [productName, setProductName] = useState("");
  const [productSlug, setProductSlug] = useState("");
  const [categoryName, setCategoryName] = useState("");
  const [categorySlug, setCategorySlug] = useState("");
  const [setName, setSetName] = useState("");
  const [setCode, setSetCode] = useState("");
  const visibleSets = sets.filter((set) => set.categoryId === categoryId);

  function selectCategoryMode(mode: CategoryMode) {
    setCategoryMode(mode);
    setSetId("");
    setSetMode("none");
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
          <h3 className="font-semibold text-zinc-950">Product</h3>
          <span className="text-xs text-zinc-500">Required fields only</span>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name">
            <input
              className={inputClass}
              maxLength={160}
              name="name"
              onBlur={() => {
                if (!productSlug) setProductSlug(slugify(productName));
              }}
              onChange={(event) => setProductName(event.target.value)}
              required
              value={productName}
            />
          </Field>
          <Field label="Slug" error={state.field === "productSlug"}>
            <input
              className={inputClass}
              maxLength={180}
              name="slug"
              onChange={(event) => setProductSlug(event.target.value.toLowerCase())}
              pattern="[a-z0-9]+(-[a-z0-9]+)*"
              required
              value={productSlug}
            />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Type">
            <select className={inputClass} defaultValue="booster_box" name="productType">
              <option value="booster_box">Booster box</option>
              <option value="collector_box">Collector box</option>
              <option value="bundle">Bundle</option>
              <option value="case">Case</option>
              <option value="other">Other</option>
            </select>
          </Field>
          <Field label="Language">
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
                  setCategoryId(event.target.value);
                  setSetId("");
                  setSetMode("none");
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
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Category name">
                <input
                  className={inputClass}
                  maxLength={160}
                  name="newCategoryName"
                  onBlur={() => {
                    if (!categorySlug) setCategorySlug(slugify(categoryName));
                  }}
                  onChange={(event) => setCategoryName(event.target.value)}
                  required
                  value={categoryName}
                />
              </Field>
              <Field label="Category slug" error={state.field === "categorySlug"}>
                <input
                  className={inputClass}
                  maxLength={180}
                  name="newCategorySlug"
                  onChange={(event) => setCategorySlug(event.target.value.toLowerCase())}
                  pattern="[a-z0-9]+(-[a-z0-9]+)*"
                  required
                  value={categorySlug}
                />
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
              <p className="mt-1 text-xs text-zinc-500">Optional. Sets are always created under the category above.</p>
            </div>
            <div className="flex flex-wrap rounded-md border border-zinc-300 bg-white p-1 text-xs font-semibold">
              <ModeButton active={setMode === "none"} onClick={() => {
                setSetMode("none");
                setSetId("");
              }}>
                No set
              </ModeButton>
              <ModeButton
                active={setMode === "existing"}
                disabled={categoryMode !== "existing" || visibleSets.length === 0}
                onClick={() => setSetMode("existing")}
              >
                Existing
              </ModeButton>
              <ModeButton active={setMode === "new"} onClick={() => {
                setSetMode("new");
                setSetId("");
              }}>
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
              <Field label="Set name">
                <input
                  className={inputClass}
                  maxLength={160}
                  name="newSetName"
                  onBlur={() => {
                    if (!setCode) setSetCode(setCodeFromName(setName));
                  }}
                  onChange={(event) => setSetName(event.target.value)}
                  required
                  value={setName}
                />
              </Field>
              <Field label="Set code" error={state.field === "setCode"}>
                <input
                  className={inputClass}
                  maxLength={16}
                  name="newSetCode"
                  onChange={(event) => setSetCode(event.target.value.toUpperCase())}
                  pattern="[A-Za-z0-9][A-Za-z0-9_-]{1,15}"
                  required
                  value={setCode}
                />
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

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function setCodeFromName(value: string): string {
  return value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 16);
}

const inputClass =
  "min-h-11 min-w-0 rounded-md border border-zinc-300 bg-white px-3 text-base text-zinc-950 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 sm:text-sm";
