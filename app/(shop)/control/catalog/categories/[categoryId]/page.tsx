import { notFound } from "next/navigation";

import {
  CategoryForm,
  type CategoryDraft,
  type CategoryRecord,
} from "@/app/(shop)/control/_components/category-form";
import {
  ControlBackLink,
  ControlActionForm,
  ControlDangerButton,
  ControlData,
} from "@/app/(shop)/control/_components/control-resource-ui";
import { PageHeader } from "@/app/_components/page-header";
import { StatusBadge } from "@/app/_components/status-badge";
import { setControlCategoryActive } from "@/app/actions/control";
import { requireControlPermission } from "@/lib/control-access";
import { createSecretClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function CategoryDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ categoryId: string }>;
  searchParams?: Promise<{
    saved?: string;
    error?: string;
    existing?: string;
    name?: string;
    publisher?: string;
    parentId?: string;
    sortOrder?: string;
    active?: string;
  }>;
}) {
  const { categoryId } = await params;
  await requireControlPermission("catalog.manage", `/control/catalog/categories/${categoryId}`);
  const supabase = createSecretClient();
  const paramsValue = (await searchParams) ?? {};
  const [categoryResult, categoriesResult, productCountResult, setCountResult] = await Promise.all([
    supabase
      .from("tcg_categories")
      .select("id, parent_id, slug, name, publisher, description, sort_order, active")
      .eq("id", categoryId)
      .maybeSingle(),
    supabase
      .from("tcg_categories")
      .select("id, parent_id, slug, name, publisher, description, sort_order, active")
      .order("sort_order")
      .order("name"),
    supabase
      .from("products")
      .select("*", { count: "exact", head: true })
      .eq("category_id", categoryId),
    supabase
      .from("sets_releases")
      .select("*", { count: "exact", head: true })
      .eq("category_id", categoryId),
  ]);

  if (categoryResult.error)
    throw new Error(`Category lookup failed: ${categoryResult.error.message}`);
  if (categoriesResult.error)
    throw new Error(`Category options failed: ${categoriesResult.error.message}`);
  if (productCountResult.error)
    throw new Error(`Category product count failed: ${productCountResult.error.message}`);
  if (setCountResult.error)
    throw new Error(`Category set count failed: ${setCountResult.error.message}`);
  if (!categoryResult.data) notFound();

  const category = categoryResult.data as CategoryRecord;
  const draft: CategoryDraft | undefined =
    paramsValue.error === "duplicate-category"
      ? {
          name: paramsValue.name,
          publisher: paramsValue.publisher,
          parentId: paramsValue.parentId,
          sortOrder: paramsValue.sortOrder ? Number(paramsValue.sortOrder) : undefined,
          active: paramsValue.active === undefined ? undefined : paramsValue.active === "true",
        }
      : undefined;
  const conflict =
    paramsValue.error === "duplicate-category"
      ? `This name conflicts with ${paramsValue.existing ?? "another category"}. Rename it or edit the existing category.`
      : undefined;

  return (
    <div className="space-y-8">
      <PageHeader
        action={
          <>
            <StatusBadge tone={category.active ? "success" : "warning"}>
              {category.active ? "Active" : "Archived"}
            </StatusBadge>
            <ControlBackLink href="/control/catalog/categories">Back to categories</ControlBackLink>
          </>
        }
        description={`/${category.slug}`}
        eyebrow="Control · Category"
        title={category.name}
      />

      {paramsValue.saved === "1" ? (
        <div
          className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900"
          role="status"
        >
          Category saved successfully.
        </div>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-3">
        <Summary label="Publisher" value={category.publisher ?? "Not set"} />
        <Summary label="Sets" value={String(setCountResult.count ?? 0)} />
        <Summary label="Products" value={String(productCountResult.count ?? 0)} />
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6">
        <CategoryForm
          categories={(categoriesResult.data ?? []) as CategoryRecord[]}
          category={category}
          draft={draft}
          error={conflict}
        />
      </section>

      <section className="rounded-xl border border-rose-100 bg-white p-5 shadow-sm">
        <h2 className="font-semibold text-zinc-950">Lifecycle</h2>
        <p className="mt-1 text-sm text-zinc-600">
          Archive active child categories, sets, and products before archiving this category.
        </p>
        <ControlActionForm
          action={setControlCategoryActive}
          className="mt-4"
          confirmation={{
            title: `${category.active ? "Archive" : "Restore"} category?`,
            description: category.active
              ? "Archiving removes this category from active catalog choices. The server will reject the change while active dependants remain."
              : "Restoring makes this category available to catalog workflows again.",
            confirmLabel: category.active ? "Archive category" : "Restore category",
            tone: category.active ? "danger" : "default",
          }}
          errorMessage="The category status could not be changed. Resolve any active dependants and try again."
          successMessage={`Category ${category.active ? "archived" : "restored"}.`}
        >
          <input name="id" type="hidden" value={category.id} />
          <input name="active" type="hidden" value={category.active ? "false" : "true"} />
          <ControlDangerButton>
            {category.active ? "Archive category" : "Restore category"}
          </ControlDangerButton>
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
