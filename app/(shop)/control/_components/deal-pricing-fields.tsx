"use client";

import { useMemo, useState } from "react";

import {
  AdminSelectField,
  AdminTextField,
} from "@/app/(shop)/control/_components/admin-form-fields";
import type { DealSkuOption } from "@/app/(shop)/control/_components/deal-form";
import { formatMoney } from "@/lib/money";

export function DealPricingFields({
  dealPriceCents,
  selectedSkuId,
  skus,
}: {
  dealPriceCents?: number;
  selectedSkuId?: string;
  skus: DealSkuOption[];
}) {
  const [skuId, setSkuId] = useState(selectedSkuId ?? "");
  const selectedSku = useMemo(() => skus.find((sku) => sku.id === skuId), [skuId, skus]);
  const originalPriceCents = selectedSku?.priceCents ?? 0;
  const currency = selectedSku?.currency ?? "SGD";
  const initialDealPrice =
    dealPriceCents && dealPriceCents > 0 ? (dealPriceCents / 100).toFixed(2) : "";

  return (
    <div className="grid gap-4 md:grid-cols-3">
      <AdminSelectField
        example={skus[0] ? `${skus[0].productName} — ${skus[0].sku}` : "Select a SKU"}
        hint="Archived products and SKUs remain visible only for existing deals."
        label="SKU"
        name="skuId"
        onValueChange={setSkuId}
        optionalLabel="Select a SKU"
        options={skus.map((sku) => ({
          value: sku.id,
          label: `${sku.productName} — ${sku.sku} · ${formatMoney(sku.priceCents, sku.currency)}${
            sku.active && sku.productActive ? "" : " (archived)"
          }`,
          disabled: (!sku.active || !sku.productActive) && sku.id !== selectedSkuId,
        }))}
        required
        value={skuId}
      />

      <AdminTextField
        example="S$199.00"
        hint="Read from the SKU's current selling price and cannot be edited here."
        label="Original price"
        name="originalPrice"
        readOnly
        value={selectedSku ? formatMoney(originalPriceCents, currency) : ""}
      />
      <input name="originalPriceCents" type="hidden" value={originalPriceCents || ""} />

      <AdminTextField
        defaultValue={initialDealPrice}
        disabled={!selectedSku || originalPriceCents <= 1}
        example="184.00"
        hint={
          selectedSku
            ? `Enter the exact ${currency} deal price. It must be lower than ${formatMoney(
                originalPriceCents,
                currency
              )}.`
            : "Select a priced SKU before entering a deal price."
        }
        inputMode="decimal"
        label={`Deal price (${currency})`}
        max={originalPriceCents > 1 ? ((originalPriceCents - 1) / 100).toFixed(2) : undefined}
        min="0.01"
        name="dealPrice"
        required
        step="0.01"
        type="number"
      />
    </div>
  );
}
