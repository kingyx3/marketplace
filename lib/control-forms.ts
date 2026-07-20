import { z } from "zod";

import {
  POSTGRES_INTEGER_MAX,
  optionalIsoDate,
  optionalSingaporeDateTime,
} from "@/lib/admin-form-values";
import { setCodeFromName, slugFromName } from "@/lib/catalog-identifiers";
import { CONTROL_PERMISSION_DEFINITIONS, CONTROL_PERMISSION_KEYS } from "@/lib/control-permissions";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value ? value : null));

const optionalUuid = z
  .string()
  .trim()
  .transform((value) => (value ? value : null))
  .pipe(z.uuid().nullable());

const optionalNonNegativeInteger = z
  .string()
  .trim()
  .refine((value) => !value || /^\d+$/.test(value), "Must be a non-negative integer")
  .transform((value) => (value ? Number(value) : null))
  .pipe(z.number().int().nonnegative().max(POSTGRES_INTEGER_MAX).nullable());

const nonNegativeInteger = z
  .string()
  .trim()
  .regex(/^\d+$/, "Must be a non-negative integer")
  .transform(Number)
  .pipe(z.number().int().nonnegative().max(POSTGRES_INTEGER_MAX));

const checkbox = z
  .union([z.literal("true"), z.literal("false")])
  .transform((value) => value === "true");

const supplierSchema = z.object({
  supplierId: optionalUuid,
  name: z.string().trim().min(2).max(160),
  supplierType: z.enum(["distributor", "publisher_direct", "peer_retailer", "other"]),
  region: optionalText(160),
  contactName: optionalText(160),
  contactEmail: z
    .union([z.literal(""), z.string().trim().max(320).pipe(z.email())])
    .transform((value) => value || null),
  contactPhone: optionalText(80),
  paymentTerms: optionalText(500),
  minOrderCents: optionalNonNegativeInteger,
  currency: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/),
  notes: optionalText(2000),
  active: checkbox,
});

const categorySchema = z.object({
  categoryId: optionalUuid,
  parentId: optionalUuid,
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Category name must produce a valid slug"),
  name: z.string().trim().min(2).max(160),
  publisher: optionalText(160),
  description: optionalText(2000),
  sortOrder: nonNegativeInteger,
  active: checkbox,
});

const setSchema = z
  .object({
    setId: optionalUuid,
    categoryId: z.uuid(),
    name: z.string().trim().min(2).max(160),
    code: z.string().regex(/^[A-Z0-9][A-Z0-9_-]{1,15}$/, "Set name must produce a valid code"),
    description: optionalText(2000),
    releaseDate: z.iso.date().nullable(),
    preorderOpenAt: z.iso.datetime().nullable(),
    preorderCloseAt: z.iso.datetime().nullable(),
    status: z.enum(["announced", "preorder_open", "preorder_closed", "released", "out_of_print"]),
    sortOrder: nonNegativeInteger,
    active: checkbox,
  })
  .refine(
    (value) =>
      !value.preorderOpenAt ||
      !value.preorderCloseAt ||
      new Date(value.preorderCloseAt) > new Date(value.preorderOpenAt),
    { message: "Preorder close must be after preorder open", path: ["preorderCloseAt"] }
  );

const accessGrantSchema = z
  .object({
    grantId: optionalUuid,
    email: z
      .string()
      .trim()
      .max(320)
      .pipe(z.email())
      .transform((value) => value.toLowerCase()),
    role: z.enum(["viewer", "support", "catalog", "operations", "admin", "owner"]),
    active: checkbox,
    permissions: z.array(z.string()).superRefine((permissions, context) => {
      for (const permission of permissions) {
        if (
          !CONTROL_PERMISSION_KEYS.includes(permission as (typeof CONTROL_PERMISSION_KEYS)[number])
        ) {
          context.addIssue({ code: "custom", message: `Unknown permission: ${permission}` });
        }
      }
    }),
  })
  .superRefine((input, context) => {
    const hasOwnerPermission = input.permissions.includes("governance.manage");
    if (input.role === "owner" && !hasOwnerPermission) {
      context.addIssue({
        code: "custom",
        path: ["permissions"],
        message: "Owner access must include administrator management",
      });
    }
    if (input.role !== "owner" && hasOwnerPermission) {
      context.addIssue({
        code: "custom",
        path: ["permissions"],
        message: "Administrator management can only be assigned to an owner",
      });
    }
  });

const statusSchema = z.object({
  id: z.uuid(),
  active: checkbox,
});

export function controlSupplierFromForm(formData: FormData) {
  return supplierSchema.parse({
    supplierId: String(formData.get("supplierId") ?? ""),
    name: String(formData.get("name") ?? ""),
    supplierType: String(formData.get("supplierType") ?? "distributor"),
    region: String(formData.get("region") ?? ""),
    contactName: String(formData.get("contactName") ?? ""),
    contactEmail: String(formData.get("contactEmail") ?? ""),
    contactPhone: String(formData.get("contactPhone") ?? ""),
    paymentTerms: String(formData.get("paymentTerms") ?? ""),
    minOrderCents: String(formData.get("minOrderCents") ?? ""),
    currency: String(formData.get("currency") ?? "SGD"),
    notes: String(formData.get("notes") ?? ""),
    active: checkboxValue(formData, "active"),
  });
}

export function controlCategoryFromForm(formData: FormData) {
  const name = String(formData.get("name") ?? "");
  return categorySchema.parse({
    categoryId: String(formData.get("categoryId") ?? ""),
    parentId: String(formData.get("parentId") ?? ""),
    slug: slugFromName(name),
    name,
    publisher: String(formData.get("publisher") ?? ""),
    description: String(formData.get("description") ?? ""),
    sortOrder: String(formData.get("sortOrder") ?? "0"),
    active: checkboxValue(formData, "active"),
  });
}

export function controlSetFromForm(formData: FormData) {
  const name = String(formData.get("name") ?? "");
  return setSchema.parse({
    setId: String(formData.get("setId") ?? ""),
    categoryId: String(formData.get("categoryId") ?? ""),
    name,
    code: setCodeFromName(name),
    description: String(formData.get("description") ?? ""),
    releaseDate: optionalIsoDate(formData, "releaseDate"),
    preorderOpenAt: optionalSingaporeDateTime(formData, "preorderOpenAt"),
    preorderCloseAt: optionalSingaporeDateTime(formData, "preorderCloseAt"),
    status: String(formData.get("status") ?? "announced"),
    sortOrder: String(formData.get("sortOrder") ?? "0"),
    active: checkboxValue(formData, "active"),
  });
}

export function controlAccessGrantFromForm(formData: FormData) {
  const permissions = new Set(["control.view", ...formData.getAll("permissions").map(String)]);
  for (const permission of CONTROL_PERMISSION_DEFINITIONS) {
    if (!permissions.has(permission.key)) continue;
    const viewPermission = CONTROL_PERMISSION_DEFINITIONS.find(
      (candidate) => candidate.domain === permission.domain && candidate.key.endsWith(".view")
    );
    if (viewPermission) permissions.add(viewPermission.key);
  }
  return accessGrantSchema.parse({
    grantId: String(formData.get("grantId") ?? ""),
    email: String(formData.get("email") ?? ""),
    role: String(formData.get("role") ?? "viewer"),
    active: checkboxValue(formData, "active"),
    permissions: [...permissions],
  });
}

export function controlStatusFromForm(formData: FormData) {
  return statusSchema.parse({
    id: String(formData.get("id") ?? ""),
    active: String(formData.get("active") ?? ""),
  });
}

function checkboxValue(formData: FormData, name: string): "true" | "false" {
  return formData.getAll(name).some((value) => String(value) === "true") ? "true" : "false";
}
