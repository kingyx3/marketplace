"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import {
  AdminSelectField,
  AdminTextField,
  AdminTextareaField,
} from "@/app/(shop)/control/_components/admin-form-fields";
import { saveCatalogProduct } from "@/app/actions/catalog-product-save";
import { initialCatalogProductActionState } from "@/lib/catalog-product-action-state";
import type {
  ControlCategoryOption,
  ControlProductRow,
  ControlProductTypeOption,
  ControlSetOption,
} from "@/lib/control-catalog";

export function CatalogProductSaveForm({
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
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState(
    saveCatalogProduct,
    initialCatalogProductActionState
  );
  const [name, setName] = useState(product.name);
  const [categoryId, setCategoryId] = useState(product.categoryId);
  const [setId, setSetId] = useState(product.setId);
  const [productType, setProductType] = useState(product.productType);
  const [language, setLanguage] = useState(product.language);
  const [imageUrl, setImageUrl] = useState(product.imageUrl ?? "");
  const [active, setActive] = useState(product.active);
  const [description, setDescription] = useState(product.description ?? "");

  useEffect(() => {
    if (state.status === "success") {
      if (formRef.current) formRef.current.dataset.dirty = "false";
      router.refresh();
    }
  }, [router, state.status, state.message]);

  return (
    <form
      action={formAction}
      aria-busy={pending}
      className="grid gap-4"
      data-admin-form="true"
      data-dirty="false"
      onInputCapture={(event) => {
        event.currentTarget.dataset.dirty = "true";
      }}
      ref={formRef}
    >
      <input name="productId" type="hidden" value={product.id} />
      <AdminTextField
        example="Pokémon Destined Rivals Booster Box"
        externalError={
          state.status === "error" && (state.field === "name" || state.field === "productIdentity")
            ? state.message
            : undefined
        }
        hint="Changing this value regenerates the product slug when saved."
        label="Display name"
        maxLength={160}
        minLength={2}
        name="name"
        onValueChange={setName}
        required
        value={name}
      />
      <div className="grid gap-4 sm:grid-cols-3">
        <AdminSelectField
          example={categories[0]?.name ?? "Select a category"}
          externalError={
            state.status === "error" &&
            (state.field === "category" || state.field === "productIdentity")
              ? state.message
              : undefined
          }
          label="Category"
          name="categoryId"
          onValueChange={setCategoryId}
          options={categories.map((item) => ({
            value: item.id,
            label: item.active ? item.name : `${item.name} (archived)`,
            disabled: !item.active && item.id !== product.categoryId,
          }))}
          required
          value={categoryId}
        />
        <AdminSelectField
          example={sets[0] ? `${sets[0].name} (${sets[0].code})` : "Select a set"}
          externalError={
            state.status === "error" && (state.field === "set" || state.field === "productIdentity")
              ? state.message
              : undefined
          }
          label="Set"
          name="setId"
          onValueChange={setSetId}
          options={sets.map((item) => ({
            value: item.id,
            label: `${item.name} (${item.code})${item.active ? "" : " · archived"}`,
            disabled: !item.active && item.id !== product.setId,
          }))}
          required
          value={setId}
        />
        <AdminSelectField
          example={productTypes[0]?.name ?? "Select a type"}
          externalError={
            state.status === "error" &&
            (state.field === "productType" || state.field === "productIdentity")
              ? state.message
              : undefined
          }
          label="Type"
          name="productType"
          onValueChange={setProductType}
          options={productTypes.map((item) => ({
            value: item.code,
            label: item.active ? item.name : `${item.name} (archived)`,
            disabled: !item.active && item.code !== product.productType,
          }))}
          required
          value={productType}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-[7rem_1fr_auto]">
        <AdminTextField
          example="EN"
          externalError={
            state.status === "error" && state.field === "productIdentity"
              ? state.message
              : undefined
          }
          hint="Use a 2–8 letter language code."
          label="Language"
          maxLength={8}
          minLength={2}
          name="language"
          onValueChange={setLanguage}
          pattern="[A-Za-z]{2,8}"
          patternMessage="Language must contain 2–8 letters, such as EN or JP."
          required
          value={language}
        />
        <AdminTextField
          example="https://cdn.example.com/products/destined-rivals.jpg"
          hint="Optional. Uploading a file below replaces this value."
          label="Image URL"
          maxLength={2048}
          name="imageUrl"
          onValueChange={setImageUrl}
          type="url"
          value={imageUrl}
        />
        <BooleanField checked={active} label="Active" name="active" onChange={setActive} />
      </div>
      <p className="text-xs text-zinc-500">
        Product identity is managed here. Pricing and publication are controlled in their dedicated
        workspaces.
      </p>
      <AdminTextareaField
        example="English booster box containing 36 packs."
        hint="Optional customer-facing product details."
        label="Description"
        maxLength={2000}
        name="description"
        onValueChange={setDescription}
        value={description}
      />
      {state.status !== "idle" ? (
        <p
          aria-live="polite"
          className={`rounded-md border px-3 py-2 text-sm ${
            state.status === "error"
              ? "border-rose-200 bg-rose-50 text-rose-800"
              : "border-emerald-200 bg-emerald-50 text-emerald-800"
          }`}
          role={state.status === "error" ? "alert" : "status"}
        >
          {state.message}
        </p>
      ) : null}
      <button
        className="min-h-10 rounded-md border border-zinc-300 px-3 text-xs font-semibold text-zinc-800 hover:border-emerald-600 hover:text-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
        disabled={pending}
        type="submit"
      >
        {pending ? "Saving product…" : "Save product"}
      </button>
    </form>
  );
}

function BooleanField({
  checked,
  label,
  name,
  onChange,
}: {
  checked: boolean;
  label: string;
  name: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-end gap-2 pb-2 text-xs font-medium text-zinc-600">
      <input name={name} type="hidden" value="false" />
      <input
        checked={checked}
        name={name}
        onChange={(event) => onChange(event.currentTarget.checked)}
        type="checkbox"
        value="true"
      />
      {label}
    </label>
  );
}
