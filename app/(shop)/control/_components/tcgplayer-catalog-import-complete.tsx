"use client";

import { useActionState, useMemo, useState, type FormEvent } from "react";
import {
  AdminSelectField,
  AdminTextField,
  AdminTextareaField,
} from "@/app/(shop)/control/_components/admin-form-fields";
import type {
  CatalogCategoryOption,
  CatalogProductTypeOption,
  CatalogSetOption,
} from "@/app/(shop)/control/_components/product-intake-form";
import { createTcgplayerCatalogProduct as createCatalogProduct } from "@/app/actions/tcgplayer-catalog";
import { createApiClient } from "@/lib/api/client";
import { createBrowserSessionProvider } from "@/lib/auth/browser-session";
import { initialCatalogProductActionState } from "@/lib/catalog-product-action-state";
import type { TcgplayerCatalogSuggestion } from "@/lib/tcgplayer-catalog";
import type { TcgplayerProductImportDraft } from "@/lib/tcgplayer-product-import";
import { CatalogReferenceSummary } from "@/app/(shop)/control/_components/tcgplayer-catalog-reference-summary";
import {
  applySuggestion,
  errorMessage,
  findNameMatch,
} from "@/app/(shop)/control/_components/tcgplayer-catalog-import-helpers";
import { ImportSubmitButton } from "@/app/(shop)/control/_components/tcgplayer-import-submit-button";
import { ImportedProductFields } from "@/app/(shop)/control/_components/tcgplayer-product-import-fields";

const NEW_VALUE = "__new__";
const APPROVAL_BOUNDARY_COPY =
  "pricing, inventory, listing approval, and publication remain separate";

export function TcgplayerCatalogImport({
  categories,
  productTypes,
  sets,
}: {
  categories: CatalogCategoryOption[];
  productTypes: CatalogProductTypeOption[];
  sets: CatalogSetOption[];
}) {
  const [createState, createAction] = useActionState(
    createCatalogProduct,
    initialCatalogProductActionState,
  );
  const [reference, setReference] = useState("");
  const [suggestion, setSuggestion] =
    useState<TcgplayerCatalogSuggestion | null>(null);
  const [productDrafts, setProductDrafts] = useState<TcgplayerProductImportDraft[]>([]);
  const [lookupStatus, setLookupStatus] = useState<
    "idle" | "loading" | "error" | "success"
  >("idle");
  const [lookupMessage, setLookupMessage] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [language, setLanguage] = useState("EN");
  const [categoryChoice, setCategoryChoice] = useState(NEW_VALUE);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryPublisher, setNewCategoryPublisher] = useState("");
  const [setChoice, setSetChoice] = useState(NEW_VALUE);
  const [newSetName, setNewSetName] = useState("");
  const [productTypeChoice, setProductTypeChoice] = useState(NEW_VALUE);
  const [newProductTypeName, setNewProductTypeName] = useState("");

  const session = useMemo(
    () =>
      createBrowserSessionProvider(
        process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "",
      ),
    [],
  );
  const api = useMemo(
    () =>
      createApiClient({
        getAccessToken: () => session.getAccessToken(),
        onUnauthorized: () => {
          window.location.assign(
            `/sign-in?next=${encodeURIComponent("/control/catalog/products/new")}`,
          );
        },
        timeoutMs: 20_000,
      }),
    [session],
  );

  const selectedCategoryId =
    categoryChoice === NEW_VALUE ? null : categoryChoice;
  const visibleSets = selectedCategoryId
    ? sets.filter((set) => set.categoryId === selectedCategoryId)
    : [];

  async function lookupProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lookupStatus === "loading") return;

    try {
      setLookupStatus("loading");
      setLookupMessage("Looking up TCGplayer catalog data…");
      const result = await api.request<TcgplayerCatalogSuggestion>(
        `/api/control/tcgplayer-catalog?product=${encodeURIComponent(reference)}`,
        { retry: true },
      );
      applySuggestion(result, categories, sets, productTypes, {
        setSuggestion,
        setProductDrafts,
        setName,
        setDescription,
        setImageUrl,
        setLanguage,
        setCategoryChoice,
        setNewCategoryName,
        setNewCategoryPublisher,
        setSetChoice,
        setNewSetName,
        setProductTypeChoice,
        setNewProductTypeName,
      });
      setLookupStatus("success");
      setLookupMessage(
        result.variants.length > 0
          ? `Catalog data loaded. ${result.variants.length} complete local product${result.variants.length === 1 ? "" : "s"} will be created from the returned variants.`
          : "Catalog data loaded. One local product will be created from the product-level details.",
      );
    } catch (error) {
      setSuggestion(null);
      setProductDrafts([]);
      setLookupStatus("error");
      setLookupMessage(errorMessage(error));
    }
  }

  function changeCategory(value: string) {
    setCategoryChoice(value);
    if (value === NEW_VALUE) {
      setSetChoice(NEW_VALUE);
      return;
    }
    const possibleSets = sets.filter((set) => set.categoryId === value);
    const matchedSet = findNameMatch(
      possibleSets,
      suggestion?.set.name ?? null,
      (set) => set.name,
    );
    setSetChoice(matchedSet?.id ?? NEW_VALUE);
  }

  function updateProductDraft(
    index: number,
    patch: Partial<TcgplayerProductImportDraft>,
  ) {
    setProductDrafts((current) =>
      current.map((draft, draftIndex) =>
        draftIndex === index ? { ...draft, ...patch } : draft,
      ),
    );
  }

  return (
    <section className="grid gap-5 rounded-xl border border-indigo-200 bg-indigo-50/60 p-5 shadow-sm sm:p-6">
      <div className="grid gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700">
            Catalog assist
          </p>
          <span className="rounded-full border border-indigo-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-indigo-700">
            Unofficial TCGplayer storefront data
          </span>
        </div>
        <h2 className="text-xl font-semibold text-zinc-950">
          Create a draft from TCGplayer
        </h2>
        <p className="max-w-3xl text-sm text-zinc-600">
          Paste a TCGplayer product URL or product ID to prefill the product
          hierarchy and every available product field. Missing values stay
          blank; {APPROVAL_BOUNDARY_COPY}.
        </p>
      </div>

      <form
        className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end"
        onSubmit={lookupProduct}
      >
        <AdminTextField
          disabled={lookupStatus === "loading"}
          example="https://www.tcgplayer.com/product/242811/... or 242811"
          hint="Only tcgplayer.com product URLs and numeric product IDs are accepted."
          label="TCGplayer product"
          maxLength={300}
          name="tcgplayerReference"
          onValueChange={setReference}
          required
          value={reference}
        />
        <button
          className="min-h-11 rounded-md bg-indigo-700 px-5 text-sm font-semibold text-white hover:bg-indigo-800 disabled:cursor-not-allowed disabled:bg-zinc-400"
          disabled={lookupStatus === "loading" || reference.trim() === ""}
          type="submit"
        >
          {lookupStatus === "loading" ? "Looking up…" : "Look up product"}
        </button>
      </form>

      {lookupMessage ? (
        <p
          className={`rounded-md border px-3 py-2 text-sm ${
            lookupStatus === "error"
              ? "border-rose-200 bg-rose-50 text-rose-800"
              : "border-indigo-200 bg-white text-zinc-700"
          }`}
          role={lookupStatus === "error" ? "alert" : "status"}
        >
          {lookupMessage}
        </p>
      ) : null}

      {suggestion ? (
        <div className="grid gap-5 border-t border-indigo-200 pt-5">
          <CatalogReferenceSummary suggestion={suggestion} />

          <form
            action={createAction}
            className="grid gap-5 rounded-xl border border-zinc-200 bg-white p-5"
            data-admin-form="true"
            data-dirty="false"
            onInputCapture={(event) => {
              event.currentTarget.dataset.dirty = "true";
            }}
          >
            {createState.status === "error" ? (
              <p
                className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800"
                role="alert"
              >
                {createState.message}
              </p>
            ) : null}

            <input
              name="tcgplayerProductId"
              type="hidden"
              value={suggestion.productId}
            />
            <input
              name="tcgplayerProducts"
              type="hidden"
              value={JSON.stringify(productDrafts)}
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <AdminTextField
                  example="Pokémon Destined Rivals Booster Box"
                  label="Display name"
                  maxLength={160}
                  minLength={2}
                  name="name"
                  onValueChange={setName}
                  required
                  value={name}
                />
              </div>
              <AdminTextField
                autoCapitalize="characters"
                example="EN"
                hint="Confirm the packaging language; TCGplayer variants may contain several languages."
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
                example="https://product-images.tcgplayer.com/..."
                hint="External image URL supplied by TCGplayer. Upload a managed image after creation when needed."
                label="Image URL"
                maxLength={2048}
                name="imageUrl"
                onValueChange={setImageUrl}
                type="url"
                value={imageUrl}
              />
              <div className="sm:col-span-2">
                <AdminTextareaField
                  example="English sealed booster box containing 36 packs."
                  hint="External descriptions are stripped of markup and remain editable."
                  label="Description"
                  maxLength={2000}
                  name="description"
                  onValueChange={setDescription}
                  value={description}
                />
              </div>
            </div>

            <div className="grid gap-4 rounded-lg border border-zinc-200 bg-zinc-50 p-4 sm:grid-cols-3">
              <div className="grid content-start gap-3">
                <AdminSelectField
                  example="Pokémon"
                  label="Local category"
                  name="catalogAssistCategory"
                  onValueChange={changeCategory}
                  options={[
                    ...categories.map((category) => ({
                      value: category.id,
                      label: category.name,
                    })),
                    { value: NEW_VALUE, label: "Create a new category" },
                  ]}
                  required
                  value={categoryChoice}
                />
                {categoryChoice === NEW_VALUE ? (
                  <>
                    <AdminTextField
                      example="Pokémon"
                      label="New category name"
                      maxLength={160}
                      minLength={2}
                      name="newCategoryName"
                      onValueChange={setNewCategoryName}
                      required
                      value={newCategoryName}
                    />
                    <AdminTextField
                      example="The Pokémon Company"
                      label="Publisher"
                      maxLength={160}
                      name="newCategoryPublisher"
                      onValueChange={setNewCategoryPublisher}
                      value={newCategoryPublisher}
                    />
                  </>
                ) : null}
              </div>

              <div className="grid content-start gap-3">
                <AdminSelectField
                  example="Destined Rivals"
                  label="Local set"
                  name="catalogAssistSet"
                  onValueChange={setSetChoice}
                  options={[
                    ...visibleSets.map((set) => ({
                      value: set.id,
                      label: `${set.name} (${set.code})`,
                    })),
                    { value: NEW_VALUE, label: "Create a new set" },
                  ]}
                  required
                  value={setChoice}
                />
                {setChoice === NEW_VALUE ? (
                  <AdminTextField
                    example="Destined Rivals"
                    label="New set name"
                    maxLength={160}
                    minLength={2}
                    name="newSetName"
                    onValueChange={setNewSetName}
                    required
                    value={newSetName}
                  />
                ) : null}
              </div>

              <div className="grid content-start gap-3">
                <AdminSelectField
                  example="Booster box"
                  label="Local product type"
                  name="catalogAssistProductType"
                  onValueChange={setProductTypeChoice}
                  options={[
                    ...productTypes.map((type) => ({
                      value: type.code,
                      label: type.name,
                    })),
                    { value: NEW_VALUE, label: "Create a new product type" },
                  ]}
                  required
                  value={productTypeChoice}
                />
                {productTypeChoice === NEW_VALUE ? (
                  <AdminTextField
                    example="Elite trainer box"
                    label="New product type name"
                    maxLength={160}
                    minLength={2}
                    name="newProductTypeName"
                    onValueChange={setNewProductTypeName}
                    required
                    value={newProductTypeName}
                  />
                ) : null}
              </div>
            </div>

            <ImportedProductFields drafts={productDrafts} onChange={updateProductDraft} />

            <input
              name="categoryMode"
              type="hidden"
              value={categoryChoice === NEW_VALUE ? "new" : "existing"}
            />
            <input
              name="categoryId"
              type="hidden"
              value={categoryChoice === NEW_VALUE ? "" : categoryChoice}
            />
            <input
              name="setMode"
              type="hidden"
              value={setChoice === NEW_VALUE ? "new" : "existing"}
            />
            <input
              name="setId"
              type="hidden"
              value={setChoice === NEW_VALUE ? "" : setChoice}
            />
            <input
              name="newSetReleaseDate"
              type="hidden"
              value={suggestion.set.releaseDate ?? ""}
            />
            <input name="newSetStatus" type="hidden" value="announced" />
            <input
              name="productTypeMode"
              type="hidden"
              value={productTypeChoice === NEW_VALUE ? "new" : "existing"}
            />
            <input
              name="productType"
              type="hidden"
              value={productTypeChoice === NEW_VALUE ? "" : productTypeChoice}
            />
            <input name="active" type="hidden" value="false" />

            <div className="flex flex-wrap items-center justify-between gap-4 border-t border-zinc-200 pt-4">
              <label className="flex min-h-11 items-center gap-2 text-sm font-medium text-zinc-700">
                <input
                  defaultChecked
                  name="active"
                  type="checkbox"
                  value="true"
                />
                Active internal draft
              </label>
              <ImportSubmitButton />
            </div>
          </form>
        </div>
      ) : null}

      <p className="text-xs text-zinc-500">
        TCGplayer storefront endpoints are undocumented and can change without
        notice. The lookup is server-only, time-bounded, read-only, and never
        blocks the manual catalog form below.
      </p>
    </section>
  );
}
