import Link from "next/link";

import { ProductIntakeForm } from "@/app/(shop)/control/_components/product-intake-form";
import { PageHeader } from "@/app/_components/page-header";
import {
  fetchControlCategories,
  fetchControlProducts,
  fetchControlProductTypes,
  fetchControlSets,
} from "@/lib/control-catalog";
import { requireControlPermission } from "@/lib/control-access";
import { createServiceClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function NewControlProductPage() {
  await requireControlPermission("manage_catalog", "/control/operations/products/new");
  const supabase = createServiceClient();
  const [products, categories, sets, productTypes] = await Promise.all([
    fetchControlProducts(supabase),
    fetchControlCategories(supabase),
    fetchControlSets(supabase),
    fetchControlProductTypes(supabase),
  ]);

  return (
    <div className="space-y-8">
      <PageHeader
        action={<BackLink href="/control/operations">Back to products</BackLink>}
        description="Create the product first. After it is saved, continue on its detail page to add and maintain related SKUs."
        eyebrow="Control · Operations"
        title="Add product"
      />

      <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6">
        <ProductIntakeForm
          categories={categories.filter((category) => category.active)}
          existingSlugs={products.map((product) => product.slug)}
          productTypes={productTypes.filter((productType) => productType.active)}
          sets={sets.filter((set) => set.active)}
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
