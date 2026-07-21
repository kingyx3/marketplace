"use client";

import {
  AdminNumberField,
  AdminTextField,
} from "@/app/(shop)/control/_components/admin-form-fields";
import type { TcgplayerSkuImportDraft } from "@/lib/tcgplayer-sku-import";
import {
  emptyToNull,
  formatUsd,
  numberValue,
  positiveIntegerOrNull,
} from "@/app/(shop)/control/_components/tcgplayer-catalog-import-helpers";

export function ImportedSkuFields({
  drafts,
  onChange,
}: {
  drafts: TcgplayerSkuImportDraft[];
  onChange: (index: number, patch: Partial<TcgplayerSkuImportDraft>) => void;
}) {
  return (
    <section className="grid gap-4 rounded-lg border border-zinc-200 p-4">
      <div>
        <h3 className="font-semibold text-zinc-950">Physical SKUs</h3>
        <p className="mt-1 text-sm text-zinc-600">
          Every TCGplayer SKU returned by the lookup will be created.
          SKU-specific values take precedence over product-level packaging data,
          and fields stay blank when TCGplayer has no value. USD market prices
          are retained as source metadata, not used as local selling prices.
        </p>
      </div>

      {drafts.length === 0 ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          No SKU variants were returned. Create the product now, then add its
          physical SKU manually.
        </p>
      ) : (
        <div className="grid gap-4">
          {drafts.map((draft, index) => (
            <article
              className="grid gap-4 rounded-lg border border-zinc-200 bg-zinc-50 p-4"
              key={`${draft.sourceSkuId ?? "variant"}-${index}`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-zinc-950">
                    TCGplayer SKU {draft.sourceSkuId ?? index + 1}
                  </p>
                  <p className="mt-1 text-xs text-zinc-500">
                    {[draft.language, draft.condition, draft.printing]
                      .filter(Boolean)
                      .join(" · ") || "No variant labels supplied"}
                    {draft.marketPriceUsd !== null
                      ? ` · ${formatUsd(draft.marketPriceUsd)} market reference`
                      : ""}
                  </p>
                </div>
                <label className="flex items-center gap-2 text-sm font-medium text-zinc-700">
                  <input
                    checked={draft.active}
                    onChange={(event) =>
                      onChange(index, { active: event.currentTarget.checked })
                    }
                    type="checkbox"
                  />
                  Active
                </label>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <AdminTextField
                  example="TCG-242811-987"
                  hint="Generated from the TCGplayer product and SKU IDs; edit only when your internal convention requires it."
                  label="SKU"
                  maxLength={64}
                  name={`tcgplayerSku.${index}.sku`}
                  onValueChange={(value) =>
                    onChange(index, { sku: value.toUpperCase() })
                  }
                  pattern="[A-Za-z0-9][A-Za-z0-9._-]{0,63}"
                  patternMessage="SKU may use letters, numbers, dots, hyphens, and underscores."
                  required
                  value={draft.sku}
                />
                <AdminTextField
                  example="01987654321098"
                  hint="Uses the SKU barcode when available; a product UPC is used only for a single returned SKU."
                  label="Barcode"
                  maxLength={64}
                  name={`tcgplayerSku.${index}.barcode`}
                  onValueChange={(value) =>
                    onChange(index, { barcode: emptyToNull(value) })
                  }
                  value={draft.barcode ?? ""}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <AdminNumberField
                  example="36"
                  label="Packs per box"
                  min={1}
                  name={`tcgplayerSku.${index}.packsPerBox`}
                  onValueChange={(value) =>
                    onChange(index, {
                      packsPerBox: positiveIntegerOrNull(value),
                    })
                  }
                  value={numberValue(draft.packsPerBox)}
                />
                <AdminNumberField
                  example="10"
                  label="Cards per pack"
                  min={1}
                  name={`tcgplayerSku.${index}.cardsPerPack`}
                  onValueChange={(value) =>
                    onChange(index, {
                      cardsPerPack: positiveIntegerOrNull(value),
                    })
                  }
                  value={numberValue(draft.cardsPerPack)}
                />
                <AdminNumberField
                  example="720"
                  label="Weight grams"
                  min={1}
                  name={`tcgplayerSku.${index}.weightGrams`}
                  onValueChange={(value) =>
                    onChange(index, {
                      weightGrams: positiveIntegerOrNull(value),
                    })
                  }
                  value={numberValue(draft.weightGrams)}
                />
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
