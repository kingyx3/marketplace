"use client";

import { useMemo, useState } from "react";

import {
  AdminSelectField,
  AdminTextField,
} from "@/app/(shop)/control/_components/admin-form-fields";
import type { DealProductOption } from "@/app/(shop)/control/_components/deal-form";
import { formatMoney } from "@/lib/money";

export function DealPricingFields({
  dealPriceCents,
  selectedProductId,
  products,
}: {
  dealPriceCents?: number;
  selectedProductId?: string;
  products: DealProductOption[];
}) {
  const [productId, setProductId] = useState(selectedProductId ?? "");
  const selectedProduct = useMemo(() => products.find((product) => product.id === productId), [productId, products]);
  const originalPriceCents = selectedProduct?.priceCents ?? 0;
  const currency = selectedProduct?.currency ?? "SGD";
  const initialDealPrice =
    dealPriceCents && dealPriceCents > 0 ? (dealPriceCents / 100).toFixed(2) : "";

  return (
    <div className="grid gap-4 md:grid-cols-3">
      <AdminSelectField
        example={products[0] ? `${products[0].productName} — ${products[0].referenceCode}` : "Select a product"}
        hint="Archived products remain visible only for existing deals."
        label="Product"
        name="productId"
        onValueChange={setProductId}
        optionalLabel="Select a product"
        options={products.map((product) => ({
          value: product.id,
          label: `${product.productName} — ${product.referenceCode} · ${formatMoney(product.priceCents, product.currency)}${
            product.active && product.productActive ? "" : " (archived)"
          }`,
          disabled: (!product.active || !product.productActive) && product.id !== selectedProductId,
        }))}
        required
        value={productId}
      />

      <AdminTextField
        example="S$199.00"
        hint="Read from the product's current selling price and cannot be edited here."
        label="Original price"
        name="originalPrice"
        readOnly
        value={selectedProduct ? formatMoney(originalPriceCents, currency) : ""}
      />
      <input name="originalPriceCents" type="hidden" value={originalPriceCents || ""} />

      <AdminTextField
        defaultValue={initialDealPrice}
        disabled={!selectedProduct || originalPriceCents <= 1}
        example="184.00"
        hint={
          selectedProduct
            ? `Enter the exact ${currency} deal price. It must be lower than ${formatMoney(
                originalPriceCents,
                currency
              )}.`
            : "Select a priced product before entering a deal price."
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
