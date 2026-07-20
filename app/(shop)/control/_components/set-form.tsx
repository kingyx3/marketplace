import {
  AdminNumberField,
  AdminSelectField,
  AdminTextField,
  AdminTextareaField,
} from "@/app/(shop)/control/_components/admin-form-fields";
import { ControlSaveButton } from "@/app/(shop)/control/_components/control-resource-ui";
import { upsertControlSet } from "@/app/actions/control";

export interface CategoryOption {
  id: string;
  name: string;
  active: boolean;
}

export interface SetRecord {
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

export interface SetDraft {
  name?: string;
  categoryId?: string;
}

export function SetForm({
  categories,
  set,
  draft,
  error,
}: {
  categories: CategoryOption[];
  set?: SetRecord;
  draft?: SetDraft;
  error?: string;
}) {
  return (
    <form action={upsertControlSet} className="grid gap-5">
      {set ? <input name="setId" type="hidden" value={set.id} /> : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <AdminTextField
          defaultValue={draft?.name ?? set?.name}
          example="Destined Rivals"
          externalError={error}
          hint="The set code is generated automatically from this name."
          label="Name"
          maxLength={160}
          minLength={2}
          name="name"
          required
        />
        <AdminSelectField
          defaultValue={
            draft?.categoryId ??
            set?.category_id ??
            categories.find((category) => category.active)?.id
          }
          example="Pokémon"
          hint="Archived categories remain available only for their existing sets."
          label="Category"
          name="categoryId"
          options={categories.map((category) => ({
            value: category.id,
            label: `${category.name}${category.active ? "" : " (archived)"}`,
            disabled: !category.active && category.id !== set?.category_id,
          }))}
          required
        />
        <AdminSelectField
          defaultValue={set?.status ?? "announced"}
          example="Announced"
          hint="Controls the release lifecycle shown to operations staff."
          label="Status"
          name="status"
          options={[
            { value: "announced", label: "Announced" },
            { value: "preorder_open", label: "Preorder open" },
            { value: "preorder_closed", label: "Preorder closed" },
            { value: "released", label: "Released" },
            { value: "out_of_print", label: "Out of print" },
          ]}
          required
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <AdminTextField
          defaultValue={set?.release_date ?? ""}
          example="2026-08-15"
          hint="Optional official or planned release date."
          label="Release date"
          name="releaseDate"
          type="date"
        />
        <AdminTextField
          defaultValue={toLocalDateTime(set?.preorder_open_at)}
          example="2026-07-20 09:00"
          hint="Optional local date and time when preorders open."
          label="Preorder opens"
          name="preorderOpenAt"
          type="datetime-local"
        />
        <AdminTextField
          defaultValue={toLocalDateTime(set?.preorder_close_at)}
          example="2026-08-10 23:59"
          hint="Optional local date and time when preorders close."
          label="Preorder closes"
          name="preorderCloseAt"
          type="datetime-local"
        />
        <AdminNumberField
          defaultValue={set?.sort_order ?? 0}
          example="10"
          hint="Lower values appear first."
          label="Sort order"
          min={0}
          name="sortOrder"
          required
        />
      </div>

      <AdminTextareaField
        defaultValue={set?.description ?? ""}
        example="Scarlet & Violet expansion featuring Team Rocket."
        hint="Optional set or release notes."
        label="Description"
        maxLength={2000}
        name="description"
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex min-h-11 items-center gap-2 text-sm font-medium text-zinc-700">
          <input name="active" type="hidden" value="false" />
          <input defaultChecked={set?.active ?? true} name="active" type="checkbox" value="true" />
          Active
        </label>
        <ControlSaveButton>{set ? "Save set" : "Create set"}</ControlSaveButton>
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
