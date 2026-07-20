import {
  AdminNumberField,
  AdminSelectField,
  AdminTextField,
  AdminTextareaField,
} from "@/app/(shop)/control/_components/admin-form-fields";
import {
  ControlActionForm,
  ControlSaveButton,
} from "@/app/(shop)/control/_components/control-resource-ui";
import { upsertControlCategory } from "@/app/actions/control";

export interface CategoryRecord {
  id: string;
  parent_id: string | null;
  slug: string;
  name: string;
  publisher: string | null;
  description: string | null;
  sort_order: number;
  active: boolean;
}

export interface CategoryDraft {
  name?: string;
  publisher?: string;
  parentId?: string;
  sortOrder?: number;
  active?: boolean;
}

export function CategoryForm({
  categories,
  category,
  draft,
  error,
}: {
  categories: CategoryRecord[];
  category?: CategoryRecord;
  draft?: CategoryDraft;
  error?: string;
}) {
  return (
    <ControlActionForm
      action={upsertControlCategory}
      className="grid gap-5"
      errorMessage="The category could not be saved. Your entries are still here; review them and try again."
      successHref="/control/catalog/categories"
      successMessage={category ? "Category updated." : "Category created."}
    >
      {category ? <input name="categoryId" type="hidden" value={category.id} /> : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <AdminTextField
          defaultValue={draft?.name ?? category?.name}
          example="Pokémon"
          externalError={error}
          hint="The slug is generated automatically from this name."
          label="Name"
          maxLength={160}
          minLength={2}
          name="name"
          required
        />
        <AdminTextField
          defaultValue={draft?.publisher ?? category?.publisher ?? ""}
          example="The Pokémon Company"
          hint="Optional publisher or rights holder."
          label="Publisher"
          maxLength={160}
          name="publisher"
        />
        <AdminNumberField
          defaultValue={draft?.sortOrder ?? category?.sort_order ?? 0}
          example="10"
          hint="Lower values appear first."
          label="Sort order"
          min={0}
          name="sortOrder"
          required
        />
      </div>

      <AdminSelectField
        defaultValue={draft?.parentId ?? category?.parent_id ?? ""}
        example="Trading card games"
        hint="Optional parent used to build the hierarchy."
        label="Parent category"
        name="parentId"
        optionalLabel="Top level"
        options={categories
          .filter((candidate) => candidate.id !== category?.id)
          .map((candidate) => ({
            value: candidate.id,
            label: `${candidate.name}${candidate.active ? "" : " (archived)"}`,
            disabled: !candidate.active && candidate.id !== category?.parent_id,
          }))}
      />

      <AdminTextareaField
        defaultValue={category?.description ?? ""}
        example="Sealed Pokémon Trading Card Game products."
        hint="Optional internal or storefront category context."
        label="Description"
        maxLength={2000}
        name="description"
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex min-h-11 items-center gap-2 text-sm font-medium text-zinc-700">
          <input name="active" type="hidden" value="false" />
          <input
            defaultChecked={draft?.active ?? category?.active ?? true}
            name="active"
            type="checkbox"
            value="true"
          />
          Active
        </label>
        <ControlSaveButton>{category ? "Save category" : "Create category"}</ControlSaveButton>
      </div>
    </ControlActionForm>
  );
}
