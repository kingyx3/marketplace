import { notFound } from "next/navigation";

import { ControlBackLink } from "@/app/(shop)/control/_components/control-resource-ui";
import {
  StorefrontConfigurationForm,
  type StorefrontConfigurationRecord,
} from "@/app/(shop)/control/_components/storefront-configuration-form";
import { PageHeader } from "@/app/_components/page-header";
import { StatusBadge } from "@/app/_components/status-badge";
import { hasControlPermission, requireControlPermission } from "@/lib/control-access";
import { createServiceClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const DEFAULT_HEADER_CONFIG: StorefrontConfigurationRecord = {
  key: "catalog_header",
  label: "Catalog header",
  description: "Catalog heading and empty-state copy.",
  value: {
    eyebrow: "Catalog",
    title: "Sealed products",
    description: "Browse current stock, preorders, and offers.",
    emptyTitle: "No products available",
    emptyDescription: "Check back for the next release.",
  },
  active: true,
};

export default async function StorefrontConfigurationDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ configurationKey: string }>;
  searchParams?: Promise<{ saved?: string }>;
}) {
  const { configurationKey } = await params;
  const { staff } = await requireControlPermission(
    "storefront.view",
    `/control/storefront/listings/configurations/${configurationKey}`
  );
  const { data, error } = await createServiceClient()
    .from("storefront_configurations")
    .select("key, label, description, value, active")
    .eq("key", configurationKey)
    .maybeSingle();

  if (error) throw new Error(`Storefront configuration lookup failed: ${error.message}`);
  if (!data && configurationKey !== DEFAULT_HEADER_CONFIG.key) notFound();

  const configuration = (data as StorefrontConfigurationRecord | null) ?? DEFAULT_HEADER_CONFIG;
  const saved = (await searchParams)?.saved === "1";

  return (
    <div className="space-y-8">
      <PageHeader
        action={
          <>
            <StatusBadge tone={configuration.active ? "success" : "neutral"}>
              {configuration.active ? "Active" : "Inactive"}
            </StatusBadge>
            <ControlBackLink href="/control/storefront/listings">Back to listings</ControlBackLink>
          </>
        }
        description={configuration.description ?? "Storefront configuration"}
        eyebrow="Control · Storefront"
        title={configuration.label}
      />

      {saved ? (
        <div
          className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900"
          role="status"
        >
          Storefront configuration saved successfully.
        </div>
      ) : null}

      {hasControlPermission(staff, "storefront.manage") ? (
        <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6">
          <StorefrontConfigurationForm configuration={configuration} />
        </section>
      ) : (
        <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-zinc-600">
            Storefront configuration is read only for your current domain coverage.
          </p>
          <pre className="mt-4 overflow-x-auto rounded-lg bg-zinc-950 p-4 text-xs text-zinc-100">
            {JSON.stringify(configuration.value, null, 2)}
          </pre>
        </section>
      )}
    </div>
  );
}
