import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/app/_components/page-header";
import { catalogSkuErrorMessage } from "@/lib/catalog-sku-errors";
import { requireControlPermission } from "@/lib/control-access";

export const metadata: Metadata = {
  title: "SKU save error",
  robots: { index: false, follow: false },
};

export default async function CatalogSkuErrorPage({
  searchParams,
}: {
  searchParams?: Promise<{ code?: string }>;
}) {
  await requireControlPermission("manage_catalog", "/control/operations/sku-error");
  const params = (await searchParams) ?? {};

  return (
    <div className="space-y-6">
      <PageHeader
        description="The SKU was not created or updated. No partial catalog or inventory changes were saved."
        eyebrow="Control · Operations"
        title="SKU could not be saved"
      />

      <section className="max-w-2xl rounded-xl border border-amber-200 bg-amber-50 p-5 shadow-sm sm:p-6">
        <p className="text-sm leading-6 text-amber-950" role="alert">
          {catalogSkuErrorMessage(params.code)}
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link
            className="inline-flex min-h-10 items-center justify-center rounded-md bg-zinc-950 px-4 text-sm font-semibold text-white hover:bg-emerald-700"
            href="/control/operations"
          >
            Return to Operations
          </Link>
          <Link
            className="inline-flex min-h-10 items-center justify-center rounded-md border border-amber-300 bg-white px-4 text-sm font-semibold text-zinc-800 hover:border-emerald-600 hover:text-emerald-700"
            href="/control"
          >
            Open control overview
          </Link>
        </div>
      </section>
    </div>
  );
}
