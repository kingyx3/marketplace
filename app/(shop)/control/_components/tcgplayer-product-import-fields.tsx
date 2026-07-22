"use client";

import {
  AdminNumberField,
  AdminTextField,
} from "@/app/(shop)/control/_components/admin-form-fields";
import type { TcgplayerProductImportDraft } from "@/lib/tcgplayer-product-import";
import {
  emptyToNull,
  formatUsd,
  numberValue,
  positiveIntegerOrNull,
} from "@/app/(shop)/control/_components/tcgplayer-catalog-import-helpers";

export function ImportedProductFields({
  drafts,
  onChange,
}: {
  drafts: TcgplayerProductImportDraft[];
  onChange: (index: number, patch: Partial<TcgplayerProductImportDraft>) => void;
}) {
  return (
    <section className="grid gap-4 rounded-lg border border-zinc-200 p-4">
      <div>
        <h3 className="font-semibold text-zinc-950">Products to create</h3>
        <p className="mt-1 text-sm text-zinc-600">
          Each sellable TCGplayer variant becomes one complete local product. Provider variant
          identifiers and USD prices remain reference metadata; local price and inventory begin
          at zero for an administrator to approve.
        </p>
      </div>

      <div className="grid gap-4">
        {drafts.map((draft, index) => (
          <article
            className="grid gap-4 rounded-lg border border-zinc-200 bg-zinc-50 p-4"
            key={`${draft.sourceVariantId ?? "product"}-${index}`}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-zinc-950">Product {index + 1}</p>
                <p className="mt-1 text-xs text-zinc-500">
                  {[draft.language, draft.condition, draft.printing].filter(Boolean).join(" · ") ||
                    "Product-level catalog data"}
                  {draft.marketPriceUsd !== null
                    ? ` · ${formatUsd(draft.marketPriceUsd)} market reference`
                    : ""}
                </p>
              </div>
              <label className="flex items-center gap-2 text-sm font-medium text-zinc-700">
                <input
                  checked={draft.active}
                  onChange={(event) => onChange(index, { active: event.currentTarget.checked })}
                  type="checkbox"
                />
                Active internal draft
              </label>
            </div>

            <AdminTextField
              example="Pokémon Destined Rivals Booster Box — English"
              label="Display name"
              maxLength={160}
              minLength={2}
              name={`tcgplayerProduct.${index}.name`}
              onValueChange={(name) => onChange(index, { name })}
              required
              value={draft.name}
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <AdminTextField
                example="TCG-242811-987"
                hint="Stable internal product reference generated from provider identifiers."
                label="Product reference"
                maxLength={64}
                name={`tcgplayerProduct.${index}.referenceCode`}
                onValueChange={(value) => onChange(index, { referenceCode: value.toUpperCase() })}
                pattern="[A-Za-z0-9][A-Za-z0-9._-]{0,63}"
                patternMessage="Reference may use letters, numbers, dots, hyphens, and underscores."
                required
                value={draft.referenceCode}
              />
              <AdminTextField
                example="01987654321098"
                label="Barcode"
                maxLength={64}
                name={`tcgplayerProduct.${index}.barcode`}
                onValueChange={(value) => onChange(index, { barcode: emptyToNull(value) })}
                value={draft.barcode ?? ""}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <AdminNumberField
                example="36"
                label="Packs per box"
                min={1}
                name={`tcgplayerProduct.${index}.packsPerBox`}
                onValueChange={(value) =>
                  onChange(index, { packsPerBox: positiveIntegerOrNull(value) })
                }
                value={numberValue(draft.packsPerBox)}
              />
              <AdminNumberField
                example="10"
                label="Cards per pack"
                min={1}
                name={`tcgplayerProduct.${index}.cardsPerPack`}
                onValueChange={(value) =>
                  onChange(index, { cardsPerPack: positiveIntegerOrNull(value) })
                }
                value={numberValue(draft.cardsPerPack)}
              />
              <AdminNumberField
                example="720"
                label="Weight grams"
                min={1}
                name={`tcgplayerProduct.${index}.weightGrams`}
                onValueChange={(value) =>
                  onChange(index, { weightGrams: positiveIntegerOrNull(value) })
                }
                value={numberValue(draft.weightGrams)}
              />
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
