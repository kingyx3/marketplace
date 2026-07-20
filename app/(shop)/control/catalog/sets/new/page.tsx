import { ControlBackLink } from "@/app/(shop)/control/_components/control-resource-ui";
import {
  SetForm,
  type CategoryOption,
  type SetDraft,
} from "@/app/(shop)/control/_components/set-form";
import { PageHeader } from "@/app/_components/page-header";
import { requireControlPermission } from "@/lib/control-access";
import { createServiceClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function NewSetPage({
  searchParams,
}: {
  searchParams?: Promise<{
    error?: string;
    name?: string;
    categoryId?: string;
  }>;
}) {
  await requireControlPermission("catalog.manage", "/control/catalog/sets/new");
  const params = (await searchParams) ?? {};
  const { data, error } = await createServiceClient()
    .from("tcg_categories")
    .select("id, name, active")
    .order("name");
  if (error) throw new Error(`Category options failed: ${error.message}`);

  const categories = (data ?? []) as CategoryOption[];
  const draft: SetDraft = { name: params.name, categoryId: params.categoryId };
  const conflict =
    params.error === "duplicate-set"
      ? "Another set in this category uses the generated code. Rename this set or edit the existing record."
      : undefined;

  return (
    <div className="space-y-8">
      <PageHeader
        action={<ControlBackLink href="/control/catalog/sets">Back to sets</ControlBackLink>}
        description="Create a release after its parent category exists."
        eyebrow="Control · Sets"
        title="Add set"
      />
      <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6">
        {categories.some((category) => category.active) ? (
          <SetForm categories={categories} draft={draft} error={conflict} />
        ) : (
          <p className="text-sm text-amber-700">Create an active category before adding a set.</p>
        )}
      </section>
    </div>
  );
}
