import { setControlSetActive, upsertControlSet } from "@/app/actions/control";
import { requireControlPermission } from "@/lib/control-access";
import { createServiceClient } from "@/lib/supabase";

interface CategoryOption {
  id: string;
  name: string;
  active: boolean;
}

interface SetRow {
  id: string;
  category_id: string;
  name: string;
  code: string;
  description: string | null;
  release_date: string | null;
  preorder_open_at: string | null;
  preorder_close_at: string | null;
  status: "announced" | "preorder_open" | "preorder_closed" | "released" | "out_of_print";
  sort_order: number;
  active: boolean;
}

export const dynamic = "force-dynamic";

export default async function ControlSetsPage() {
  await requireControlPermission("manage_catalog", "/control/sets");
  const supabase = createServiceClient();
  const [setResult, categoryResult, productResult] = await Promise.all([
    supabase
      .from("sets_releases")
      .select(
        "id, category_id, name, code, description, release_date, preorder_open_at, preorder_close_at, status, sort_order, active"
      )
      .order("active", { ascending: false })
      .order("sort_order")
      .order("release_date", { ascending: false, nullsFirst: false }),
    supabase.from("tcg_categories").select("id, name, active").order("name"),
    supabase.from("products").select("set_id"),
  ]);

  if (setResult.error) throw new Error(`Set list failed: ${setResult.error.message}`);
  if (categoryResult.error) throw new Error(`Category options failed: ${categoryResult.error.message}`);
  if (productResult.error) throw new Error(`Set product counts failed: ${productResult.error.message}`);

  const sets = (setResult.data ?? []) as SetRow[];
  const categories = (categoryResult.data ?? []) as CategoryOption[];
  const categoryNames = new Map(categories.map((category) => [category.id, category.name]));
  const productCounts = new Map<string, number>();
  for (const row of productResult.data ?? []) {
    if (!row.set_id) continue;
    productCounts.set(row.set_id, (productCounts.get(row.set_id) ?? 0) + 1);
  }

  return (
    <div className="space-y-8">
      <PageHeading
        title="Sets and releases"
        description="Manage set relationships, release lifecycle, preorder windows, ordering, and archive state. Sets with active products cannot be archived."
      />

      <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-zinc-950">Add set</h2>
        {categories.some((category) => category.active) ? (
          <SetForm categories={categories} />
        ) : (
          <p className="mt-3 text-sm text-amber-700">Create an active category before adding a set.</p>
        )}
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-zinc-950">Release directory</h2>
          <span className="text-sm text-zinc-500">{sets.length} sets</span>
        </div>

        {sets.length === 0 ? (
          <EmptyState text="No sets have been configured." />
        ) : (
          <div className="grid gap-4 xl:grid-cols-2">
            {sets.map((set) => (
              <article key={set.id} className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold text-zinc-950">{set.name}</h3>
                      <Status active={set.active} />
                      <span className="rounded-full bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700">
                        {set.status.replaceAll("_", " ")}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-zinc-500">
                      {set.code} · {categoryNames.get(set.category_id) ?? "Unknown category"}
                    </p>
                  </div>
                  <form action={setControlSetActive}>
                    <input name="id" type="hidden" value={set.id} />
                    <input name="active" type="hidden" value={set.active ? "false" : "true"} />
                    <button
                      className={
                        set.active
                          ? "rounded-md border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50"
                          : "rounded-md border border-emerald-200 px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"
                      }
                    >
                      {set.active ? "Archive" : "Restore"}
                    </button>
                  </form>
                </div>

                <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-3">
                  <Data label="Release" value={set.release_date ?? "Unscheduled"} />
                  <Data label="Products" value={String(productCounts.get(set.id) ?? 0)} />
                  <Data label="Sort order" value={String(set.sort_order)} />
                </dl>

                <details className="mt-5 border-t border-zinc-100 pt-4">
                  <summary className="cursor-pointer text-sm font-semibold text-zinc-700">Edit set</summary>
                  <SetForm categories={categories} set={set} />
                </details>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function SetForm({ categories, set }: { categories: CategoryOption[]; set?: SetRow }) {
  return (
    <form action={upsertControlSet} className="mt-4 grid gap-4">
      {set ? <input name="setId" type="hidden" value={set.id} /> : null}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Field label="Name" name="name" required value={set?.name} />
        <Field label="Code" name="code" required value={set?.code} />
        <label className="grid gap-1 text-sm font-medium text-zinc-700">
          Category
          <select
            className="min-h-10 rounded-md border border-zinc-300 px-3 text-sm"
            defaultValue={set?.category_id ?? categories.find((category) => category.active)?.id}
            name="categoryId"
            required
          >
            {categories.map((category) => (
              <option key={category.id} disabled={!category.active && category.id !== set?.category_id} value={category.id}>
                {category.name}{category.active ? "" : " (archived)"}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm font-medium text-zinc-700">
          Status
          <select
            className="min-h-10 rounded-md border border-zinc-300 px-3 text-sm"
            defaultValue={set?.status ?? "announced"}
            name="status"
          >
            <option value="announced">Announced</option>
            <option value="preorder_open">Preorder open</option>
            <option value="preorder_closed">Preorder closed</option>
            <option value="released">Released</option>
            <option value="out_of_print">Out of print</option>
          </select>
        </label>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Field label="Release date" name="releaseDate" type="date" value={set?.release_date ?? ""} />
        <Field
          label="Preorder opens"
          name="preorderOpenAt"
          type="datetime-local"
          value={toLocalDateTime(set?.preorder_open_at)}
        />
        <Field
          label="Preorder closes"
          name="preorderCloseAt"
          type="datetime-local"
          value={toLocalDateTime(set?.preorder_close_at)}
        />
        <Field
          label="Sort order"
          min={0}
          name="sortOrder"
          required
          type="number"
          value={String(set?.sort_order ?? 0)}
        />
      </div>
      <label className="grid gap-1 text-sm font-medium text-zinc-700">
        Description
        <textarea
          className="min-h-24 rounded-md border border-zinc-300 px-3 py-2 text-sm"
          defaultValue={set?.description ?? ""}
          maxLength={2000}
          name="description"
        />
      </label>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm font-medium text-zinc-700">
          <input name="active" type="hidden" value="false" />
          <input defaultChecked={set?.active ?? true} name="active" type="checkbox" value="true" />
          Active
        </label>
        <button className="rounded-md bg-zinc-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700">
          {set ? "Save set" : "Create set"}
        </button>
      </div>
    </form>
  );
}

function toLocalDateTime(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function Field({
  label,
  name,
  value,
  required = false,
  type = "text",
  min,
}: {
  label: string;
  name: string;
  value?: string;
  required?: boolean;
  type?: string;
  min?: number;
}) {
  return (
    <label className="grid gap-1 text-sm font-medium text-zinc-700">
      {label}
      <input
        className="min-h-10 rounded-md border border-zinc-300 px-3 text-sm"
        defaultValue={value}
        min={min}
        name={name}
        required={required}
        type={type}
      />
    </label>
  );
}

function PageHeading({ title, description }: { title: string; description: string }) {
  return (
    <div>
      <p className="text-sm font-semibold uppercase tracking-[0.16em] text-emerald-700">Catalog</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-950">{title}</h1>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-600">{description}</p>
    </div>
  );
}

function Status({ active }: { active: boolean }) {
  return (
    <span
      className={
        active
          ? "rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700"
          : "rounded-full bg-zinc-100 px-2 py-1 text-xs font-semibold text-zinc-600"
      }
    >
      {active ? "Active" : "Archived"}
    </span>
  );
}

function Data({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">{label}</dt>
      <dd className="mt-1 text-zinc-800">{value}</dd>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="rounded-xl border border-dashed border-zinc-300 bg-white p-8 text-sm text-zinc-500">{text}</div>;
}
