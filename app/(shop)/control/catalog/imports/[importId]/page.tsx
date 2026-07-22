import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/app/_components/page-header";
import { StatusBadge } from "@/app/_components/status-badge";
import { fetchCatalogImportConfirmation } from "@/lib/catalog-imports";
import { requireControlPermission } from "@/lib/control-access";
import { formatMoney } from "@/lib/money";

export const dynamic = "force-dynamic";

export default async function CatalogImportConfirmationPage({
  params,
}: {
  params: Promise<{ importId: string }>;
}) {
  const { importId } = await params;
  await requireControlPermission("catalog.manage", `/control/catalog/imports/${importId}`);
  const confirmation = await fetchCatalogImportConfirmation(importId);
  if (!confirmation) notFound();

  return (
    <div className="space-y-8">
      <PageHeader
        action={<LinkButton href="/control/catalog/products/new">Import another product</LinkButton>}
        description={`TCGplayer product ${confirmation.providerProductId} created ${confirmation.products.length} local product${confirmation.products.length === 1 ? "" : "s"}. Review each section and open any product that needs changes.`}
        eyebrow="Control · Catalog import complete"
        title="Products created"
      />

      <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-950">
        <p className="font-semibold">The import completed atomically.</p>
        <p className="mt-1">
          Every product and its zero-stock inventory record now exists. Local pricing, stock,
          listing approval, and publication remain explicit administrator decisions.
        </p>
      </section>

      <div className="grid gap-4">
        {confirmation.products.map((product, index) => (
          <details
            className="group rounded-xl border border-zinc-200 bg-white shadow-sm"
            key={product.id}
            open={index === 0}
          >
            <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 p-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  Product {index + 1} of {confirmation.products.length}
                </p>
                <h2 className="mt-1 text-lg font-semibold text-zinc-950">{product.name}</h2>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge tone={product.active ? "success" : "warning"}>
                  {product.active ? "Active draft" : "Archived draft"}
                </StatusBadge>
                <span className="text-sm font-semibold text-zinc-600 group-open:hidden">Open</span>
                <span className="hidden text-sm font-semibold text-zinc-600 group-open:inline">Close</span>
              </div>
            </summary>

            <div className="grid gap-5 border-t border-zinc-200 p-5">
              <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Value label="Product reference" value={product.referenceCode} />
                <Value label="Barcode" value={product.barcode ?? "Not supplied"} />
                <Value label="Language" value={product.language} />
                <Value
                  label="TCGplayer variant"
                  value={product.providerVariantId ? String(product.providerVariantId) : "Product-level data"}
                />
                <Value label="Packs per box" value={optionalNumber(product.packsPerBox)} />
                <Value label="Cards per pack" value={optionalNumber(product.cardsPerPack)} />
                <Value label="Weight" value={product.weightGrams ? `${product.weightGrams} g` : "Not supplied"} />
                <Value label="Local price" value={formatMoney(product.priceCents, product.currency)} />
              </dl>
              <div className="flex flex-wrap justify-end gap-3">
                <LinkButton href={`/products/${product.slug}`}>Preview product</LinkButton>
                <LinkButton primary href={`/control/catalog/products/${product.id}`}>
                  Open and edit product
                </LinkButton>
              </div>
            </div>
          </details>
        ))}
      </div>

      <div className="flex justify-end">
        <LinkButton href="/control/catalog">Return to catalog</LinkButton>
      </div>
    </div>
  );
}

function optionalNumber(value: number | null) {
  return value === null ? "Not supplied" : String(value);
}

function Value({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{label}</dt>
      <dd className="mt-1 break-words text-sm font-medium text-zinc-900">{value}</dd>
    </div>
  );
}

function LinkButton({
  children,
  href,
  primary = false,
}: {
  children: React.ReactNode;
  href: string;
  primary?: boolean;
}) {
  return (
    <Link
      className={`inline-flex min-h-10 items-center justify-center rounded-md px-4 text-sm font-semibold ${
        primary
          ? "bg-emerald-700 text-white hover:bg-emerald-800"
          : "border border-zinc-300 bg-white text-zinc-800 hover:border-emerald-600 hover:text-emerald-700"
      }`}
      href={href}
    >
      {children}
    </Link>
  );
}
