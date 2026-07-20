import { notFound } from "next/navigation";

import {
  ControlBackLink,
  ControlActionForm,
  ControlDangerButton,
  ControlData,
} from "@/app/(shop)/control/_components/control-resource-ui";
import {
  SetForm,
  type CategoryOption,
  type SetDraft,
  type SetRecord,
} from "@/app/(shop)/control/_components/set-form";
import { PageHeader } from "@/app/_components/page-header";
import { StatusBadge } from "@/app/_components/status-badge";
import { setControlSetActive } from "@/app/actions/control";
import { requireControlPermission } from "@/lib/control-access";
import { createServiceClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function SetDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ setId: string }>;
  searchParams?: Promise<{
    saved?: string;
    error?: string;
    name?: string;
    categoryId?: string;
  }>;
}) {
  const { setId } = await params;
  await requireControlPermission("catalog.manage", `/control/catalog/sets/${setId}`);
  const supabase = createServiceClient();
  const paramsValue = (await searchParams) ?? {};
  const [setResult, categoryResult, productCountResult] = await Promise.all([
    supabase
      .from("sets_releases")
      .select(
        "id, category_id, name, code, description, release_date, preorder_open_at, preorder_close_at, status, sort_order, active"
      )
      .eq("id", setId)
      .maybeSingle(),
    supabase.from("tcg_categories").select("id, name, active").order("name"),
    supabase.from("products").select("*", { count: "exact", head: true }).eq("set_id", setId),
  ]);

  if (setResult.error) throw new Error(`Set lookup failed: ${setResult.error.message}`);
  if (categoryResult.error)
    throw new Error(`Category options failed: ${categoryResult.error.message}`);
  if (productCountResult.error)
    throw new Error(`Set product count failed: ${productCountResult.error.message}`);
  if (!setResult.data) notFound();

  const set = setResult.data as SetRecord;
  const categories = (categoryResult.data ?? []) as CategoryOption[];
  const categoryName =
    categories.find((category) => category.id === set.category_id)?.name ?? "Unknown category";
  const draft: SetDraft | undefined =
    paramsValue.error === "duplicate-set"
      ? { name: paramsValue.name, categoryId: paramsValue.categoryId }
      : undefined;
  const conflict =
    paramsValue.error === "duplicate-set"
      ? "Another set in this category uses the generated code. Rename this set or edit the existing record."
      : undefined;

  return (
    <div className="space-y-8">
      <PageHeader
        action={
          <>
            <StatusBadge tone={set.active ? "success" : "warning"}>
              {set.active ? "Active" : "Archived"}
            </StatusBadge>
            <StatusBadge tone="info">{set.status.replaceAll("_", " ")}</StatusBadge>
            <ControlBackLink href="/control/catalog/sets">Back to sets</ControlBackLink>
          </>
        }
        description={`${set.code} · ${categoryName}`}
        eyebrow="Control · Set"
        title={set.name}
      />

      {paramsValue.saved === "1" ? (
        <div
          className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900"
          role="status"
        >
          Set saved successfully.
        </div>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-3">
        <Summary label="Release" value={set.release_date ?? "Unscheduled"} />
        <Summary label="Products" value={String(productCountResult.count ?? 0)} />
        <Summary label="Sort order" value={String(set.sort_order)} />
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6">
        <SetForm categories={categories} set={set} draft={draft} error={conflict} />
      </section>

      <section className="rounded-xl border border-rose-100 bg-white p-5 shadow-sm">
        <h2 className="font-semibold text-zinc-950">Lifecycle</h2>
        <p className="mt-1 text-sm text-zinc-600">Sets with active products cannot be archived.</p>
        <ControlActionForm
          action={setControlSetActive}
          className="mt-4"
          confirmation={{
            title: `${set.active ? "Archive" : "Restore"} set?`,
            description: set.active
              ? "Archiving removes this set from active catalog choices. The server will reject the change while active products remain."
              : "Restoring makes this set available to catalog workflows again.",
            confirmLabel: set.active ? "Archive set" : "Restore set",
            tone: set.active ? "danger" : "default",
          }}
          errorMessage="The set status could not be changed. Resolve any active products and try again."
          successMessage={`Set ${set.active ? "archived" : "restored"}.`}
        >
          <input name="id" type="hidden" value={set.id} />
          <input name="active" type="hidden" value={set.active ? "false" : "true"} />
          <ControlDangerButton>{set.active ? "Archive set" : "Restore set"}</ControlDangerButton>
        </ControlActionForm>
      </section>
    </div>
  );
}

function Summary({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
      <ControlData label={label} value={value} />
    </div>
  );
}
