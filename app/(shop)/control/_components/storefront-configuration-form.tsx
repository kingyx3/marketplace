import {
  AdminTextField,
  AdminTextareaField,
} from "@/app/(shop)/control/_components/admin-form-fields";
import { ControlSaveButton } from "@/app/(shop)/control/_components/control-resource-ui";
import { upsertStorefrontConfiguration } from "@/app/actions/admin";

export interface StorefrontConfigurationRecord {
  key: string;
  label: string;
  description: string | null;
  value: Record<string, unknown>;
  active: boolean;
}

export function StorefrontConfigurationForm({
  configuration,
}: {
  configuration: StorefrontConfigurationRecord;
}) {
  return (
    <form action={upsertStorefrontConfiguration} className="grid gap-5">
      <div className="grid gap-4 md:grid-cols-2">
        <AdminTextField
          defaultValue={configuration.key}
          example="catalog_header"
          hint="Stable configuration key. Existing keys cannot be changed."
          label="Key"
          maxLength={120}
          name="key"
          pattern="[a-z0-9]+([_:-][a-z0-9]+)*"
          patternMessage="Use lowercase words separated by _, :, or -."
          readOnly
          required
        />
        <AdminTextField
          defaultValue={configuration.label}
          example="Catalog header"
          hint="Internal administrator label."
          label="Label"
          maxLength={160}
          name="label"
          required
        />
      </div>

      <AdminTextField
        defaultValue={configuration.description ?? ""}
        example="Catalog heading and empty-state copy."
        hint="Optional internal explanation."
        label="Description"
        maxLength={500}
        name="description"
      />

      <AdminTextareaField
        className="min-h-64 font-mono text-xs"
        defaultValue={JSON.stringify(configuration.value, null, 2)}
        example={'{"title":"Sealed products"}'}
        hint="Valid JSON only. Keep customer-facing copy concise."
        label="JSON value"
        name="valueJson"
        required
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex min-h-11 items-center gap-2 text-sm font-medium text-zinc-700">
          <input name="active" type="hidden" value="false" />
          <input defaultChecked={configuration.active} name="active" type="checkbox" value="true" />
          Active
        </label>
        <ControlSaveButton>Save configuration</ControlSaveButton>
      </div>
    </form>
  );
}
