import { notFound } from "next/navigation";

import { TcgplayerImportConfirmation } from "@/app/(shop)/control/_components/tcgplayer-import-confirmation";
import {
  ControlBackLink,
  ControlPrimaryLink,
} from "@/app/(shop)/control/_components/control-resource-ui";
import { PageHeader } from "@/app/_components/page-header";
import { requireControlPermission } from "@/lib/control-access";
import {
  fetchControlCategories,
  fetchControlProduct,
  fetchControlProductTypes,
  fetchControlSets,
} from "@/lib/control-catalog";
import { createSecretClient } from "@/lib/supabase";

type TcgplayerImportCompletePageProps = {
  params: Promise<{ productId: string }>;
};

export const dynamic = "force-dynamic";

export default async function TcgplayerImportCompletePage({
  params,
}: TcgplayerImportCompletePageProps) {
  const { productId } = await params;
  await requireControlPermission(
    "catalog.manage",
    `/control/catalog/products/${productId}/import-complete`,
  );
  const supabase = createSecretClient();
  const [product, categories, sets, productTypes] = await Promise.all([
    fetchControlProduct(productId, supabase),
    fetchControlCategories(supabase),
    fetchControlSets(supabase),
    fetchControlProductTypes(supabase),
  ]);

  if (!product) notFound();

  return (
    <div className="space-y-8">
      <PageHeader
        action={
          <div className="flex flex-wrap gap-2">
            <ControlBackLink href="/control/catalog">
              Back to products
            </ControlBackLink>
            <ControlPrimaryLink href={`/control/catalog/products/${product.id}`}>
              Product workflow
            </ControlPrimaryLink>
          </div>
        }
        description="The TCGplayer product, hierarchy, and all available physical SKUs were created atomically. Review or edit only the sections that need human correction."
        eyebrow="Control · Catalog import"
        title="TCGplayer import complete"
      />

      <TcgplayerImportConfirmation
        categories={categories}
        product={product}
        productTypes={productTypes}
        sets={sets}
      />
    </div>
  );
}
