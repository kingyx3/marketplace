import Link from "next/link";

import {
  hasSellableCatalogSku,
  type CatalogReadinessProduct,
} from "@/lib/catalog-readiness";
import { createServiceClient } from "@/lib/supabase";

interface CatalogReadinessRow extends CatalogReadinessProduct {
  id: string;
  name: string;
}

export async function CatalogReadinessAlert() {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("products")
    .select("id, name, product_variants(booster_box_skus(active, price_cents))")
    .eq("active", true)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Catalog readiness query failed: ${error.message}`);
  }

  const products = (data ?? []) as unknown as CatalogReadinessRow[];
  const incompleteProducts = products.filter((product) => !hasSellableCatalogSku(product));

  if (incompleteProducts.length === 0) return null;

  const previewNames = incompleteProducts
    .slice(0, 3)
    .map((product) => product.name)
    .join(", ");
  const remaining = incompleteProducts.length - Math.min(incompleteProducts.length, 3);

  return (
    <section
      aria-live="polite"
      className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-950 shadow-sm"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">
            {incompleteProducts.length} {incompleteProducts.length === 1 ? "product needs" : "products need"} a SKU
          </h2>
          <p className="mt-1 text-sm leading-6 text-amber-900">
            These products stay hidden from the storefront until they have an active SKU with a positive selling price.
          </p>
          <p className="mt-1 text-xs text-amber-800">
            {previewNames}
            {remaining > 0 ? ` and ${remaining} more` : ""}
          </p>
        </div>
        <Link
          className="inline-flex min-h-10 items-center rounded-md border border-amber-400 bg-white px-3 text-sm font-semibold text-amber-950 hover:border-amber-600"
          href="/control/operations"
        >
          Complete SKU setup
        </Link>
      </div>
    </section>
  );
}
