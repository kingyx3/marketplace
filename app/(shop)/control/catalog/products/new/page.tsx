import Link from "next/link";

import { ProductIntakeForm } from "@/app/(shop)/control/_components/product-intake-form";
import { TcgplayerCatalogImport } from "@/app/(shop)/control/_components/tcgplayer-catalog-import";
import { PageHeader } from "@/app/_components/page-header";
import { requireControlPermission } from "@/lib/control-access";
import {
  fetchControlCategories,
  fetchControlProducts,
  fetchControlProductTypes,
  fetchControlSets,
} from "@/lib/control-catalog";
import { createServiceClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function NewControlProductPage() {
  await requireControlPermission("catalog.manage", "/control/catalog/products/new");
  const supabase = createServiceClient();
  const [products, categories, sets, productTypes] = await Promise.all([
    fetchControlProducts(supabase),
    fetchControlCategories(supabase),
    fetchControlSets(supabase),
    fetchControlProductTypes(supabase),
  ]);
  const activeCategories = categories.filter((category) => category.active);
  const activeSets = sets.filter((set) => set.active);
  const activeProductTypes = productTypes.filter((productType) => productType.active);

  return (
    <div className="space-y-8">
      <PageHeader
        action={<BackLink href="/control/catalog">Back to products</BackLink>}
        description="Create the internal product draft first, then continue through SKU, Pricing, Supply, Listing, and Publication."
        eyebrow="Control · Catalog"
        title="Create product"
      />

      <TcgplayerCatalogImport
        categories={activeCategories}
        productTypes={activeProductTypes}
        sets={activeSets}
      />

      <section className="grid gap-5 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
            Manual entry
          </p>
          <h2 className="mt-1 text-xl font-semibold text-zinc-950">Build a product manually</h2>
          <p className="mt-1 text-sm text-zinc-600">
            Use the standard hierarchy form when TCGplayer does not have the product or its public
            storefront data is unavailable.
          </p>
        </div>
        <ProductIntakeForm
          categories={activeCategories}
          existingSlugs={products.map((product) => product.slug)}
          productTypes={activeProductTypes}
          sets={activeSets}
        />
      </section>
    </div>
  );
}

function BackLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      className="inline-flex min-h-10 items-center justify-center rounded-md border border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-800 hover:border-emerald-600 hover:text-emerald-700"
      href={href}
    >
      {children}
    </Link>
  );
}
