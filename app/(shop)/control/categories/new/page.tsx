import {
  CategoryForm,
  type CategoryDraft,
  type CategoryRecord,
} from "@/app/(shop)/control/_components/category-form";
import { ControlBackLink } from "@/app/(shop)/control/_components/control-resource-ui";
import { PageHeader } from "@/app/_components/page-header";
import { requireControlPermission } from "@/lib/control-access";
import { createServiceClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function NewCategoryPage({
  searchParams,
}: {
  searchParams?: Promise<{
    error?: string;
    existing?: string;
    name?: string;
    publisher?: string;
    parentId?: string;
    sortOrder?: string;
    active?: string;
  }>;
}) {
  await requireControlPermission("manage_catalog", "/control/categories/new");
  const params = (await searchParams) ?? {};
  const { data, error } = await createServiceClient()
    .from("tcg_categories")
    .select("id, parent_id, slug, name, publisher, description, sort_order, active")
    .order("sort_order")
    .order("name");
  if (error) throw new Error(`Category options failed: ${error.message}`);

  const draft: CategoryDraft = {
    name: params.name,
    publisher: params.publisher,
    parentId: params.parentId,
    sortOrder: params.sortOrder ? Number(params.sortOrder) : undefined,
    active: params.active === undefined ? undefined : params.active === "true",
  };
  const conflict =
    params.error === "duplicate-category"
      ? `This name conflicts with ${params.existing ?? "another category"}. Rename it or edit the existing category.`
      : undefined;

  return (
    <div className="space-y-8">
      <PageHeader
        action={<ControlBackLink href="/control/categories">Back to categories</ControlBackLink>}
        description="Create a category and then use it in set and product relationships."
        eyebrow="Control · Categories"
        title="Add category"
      />
      <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6">
        <CategoryForm
          categories={(data ?? []) as CategoryRecord[]}
          draft={draft}
          error={conflict}
        />
      </section>
    </div>
  );
}
