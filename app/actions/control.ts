"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  controlAccessGrantFromForm,
  controlCategoryFromForm,
  controlSetFromForm,
  controlStatusFromForm,
  controlSupplierFromForm,
} from "@/lib/control-forms";
import { requireControlPermission } from "@/lib/control-access";
import { createServiceClient } from "@/lib/supabase";

export async function upsertControlSupplier(formData: FormData) {
  const sourceId = optionalFormId(formData, "supplierId");
  const returnPath = sourceId ? `/control/suppliers/${sourceId}` : "/control/suppliers/new";
  const { user } = await requireControlPermission("manage_suppliers", returnPath);
  const input = controlSupplierFromForm(formData);
  const contact = {
    name: input.contactName,
    email: input.contactEmail,
    phone: input.contactPhone,
  };

  const { data, error } = await createServiceClient().rpc("admin_upsert_supplier", {
    p_supplier_id: input.supplierId,
    p_name: input.name,
    p_supplier_type: input.supplierType,
    p_region: input.region,
    p_contact: contact,
    p_payment_terms: input.paymentTerms,
    p_min_order_cents: input.minOrderCents,
    p_currency: input.currency,
    p_notes: input.notes,
    p_active: input.active,
    p_actor_auth_user_id: user.id,
  });

  if (error) throw new Error(`Supplier save failed: ${error.message}`);
  const supplierId = readRpcId(data, "supplier_id") ?? input.supplierId;
  if (!supplierId) throw new Error("Supplier save failed: the database did not return a supplier ID");

  revalidateControlPaths(
    "/control/suppliers",
    `/control/suppliers/${supplierId}`,
    "/control/operations"
  );
  redirect(`/control/suppliers/${supplierId}?saved=1`);
}

export async function setControlSupplierActive(formData: FormData) {
  const { user } = await requireControlPermission("manage_suppliers", "/control/suppliers");
  const input = controlStatusFromForm(formData);
  const { error } = await createServiceClient().rpc("admin_set_supplier_active", {
    p_supplier_id: input.id,
    p_active: input.active,
    p_actor_auth_user_id: user.id,
  });

  if (error) throw new Error(`Supplier status update failed: ${error.message}`);
  revalidateControlPaths(
    "/control/suppliers",
    `/control/suppliers/${input.id}`,
    "/control/operations"
  );
}

export async function upsertControlCategory(formData: FormData) {
  const sourceId = optionalFormId(formData, "categoryId");
  const returnPath = sourceId ? `/control/categories/${sourceId}` : "/control/categories/new";
  const { user } = await requireControlPermission("manage_catalog", returnPath);
  const input = controlCategoryFromForm(formData);
  const supabase = createServiceClient();
  let duplicateQuery = supabase
    .from("tcg_categories")
    .select("id, name, slug")
    .eq("slug", input.slug);
  if (input.categoryId) duplicateQuery = duplicateQuery.neq("id", input.categoryId);
  const { data: duplicate, error: duplicateError } = await duplicateQuery.maybeSingle();
  if (duplicateError) throw new Error(`Category duplicate check failed: ${duplicateError.message}`);
  if (duplicate) redirectToCategoryConflict(input, duplicate.name);

  const { data, error } = await supabase.rpc("admin_upsert_category", {
    p_category_id: input.categoryId,
    p_parent_id: input.parentId,
    p_slug: input.slug,
    p_name: input.name,
    p_publisher: input.publisher,
    p_description: input.description,
    p_sort_order: input.sortOrder,
    p_active: input.active,
    p_actor_auth_user_id: user.id,
  });

  if (error?.code === "23505") redirectToCategoryConflict(input, "another category");
  if (error) throw new Error(`Category save failed: ${error.message}`);

  const categoryId = readRpcId(data, "category_id") ?? input.categoryId;
  if (!categoryId) throw new Error("Category save failed: the database did not return a category ID");

  revalidateControlPaths(
    "/control/categories",
    `/control/categories/${categoryId}`,
    "/control/sets",
    "/control/operations",
    "/products"
  );
  redirect(`/control/categories/${categoryId}?saved=1`);
}

export async function setControlCategoryActive(formData: FormData) {
  const { user } = await requireControlPermission("manage_catalog", "/control/categories");
  const input = controlStatusFromForm(formData);
  const { error } = await createServiceClient().rpc("admin_set_category_active", {
    p_category_id: input.id,
    p_active: input.active,
    p_actor_auth_user_id: user.id,
  });

  if (error) throw new Error(`Category status update failed: ${error.message}`);
  revalidateControlPaths(
    "/control/categories",
    `/control/categories/${input.id}`,
    "/control/sets",
    "/control/operations",
    "/products"
  );
}

export async function upsertControlSet(formData: FormData) {
  const sourceId = optionalFormId(formData, "setId");
  const returnPath = sourceId ? `/control/sets/${sourceId}` : "/control/sets/new";
  const { user } = await requireControlPermission("manage_catalog", returnPath);
  const input = controlSetFromForm(formData);
  const { data, error } = await createServiceClient().rpc("admin_upsert_set_release", {
    p_set_id: input.setId,
    p_category_id: input.categoryId,
    p_name: input.name,
    p_code: input.code,
    p_description: input.description,
    p_release_date: input.releaseDate,
    p_preorder_open_at: input.preorderOpenAt,
    p_preorder_close_at: input.preorderCloseAt,
    p_status: input.status,
    p_sort_order: input.sortOrder,
    p_active: input.active,
    p_actor_auth_user_id: user.id,
  });

  if (error?.code === "23505") redirectToSetConflict(input);
  if (error) throw new Error(`Set save failed: ${error.message}`);

  const setId = readRpcId(data, "set_id") ?? input.setId;
  if (!setId) throw new Error("Set save failed: the database did not return a set ID");

  revalidateControlPaths(
    "/control/sets",
    `/control/sets/${setId}`,
    "/control/operations",
    "/products",
    "/orders"
  );
  redirect(`/control/sets/${setId}?saved=1`);
}

export async function setControlSetActive(formData: FormData) {
  const { user } = await requireControlPermission("manage_catalog", "/control/sets");
  const input = controlStatusFromForm(formData);
  const { error } = await createServiceClient().rpc("admin_set_set_release_active", {
    p_set_id: input.id,
    p_active: input.active,
    p_actor_auth_user_id: user.id,
  });

  if (error) throw new Error(`Set status update failed: ${error.message}`);
  revalidateControlPaths(
    "/control/sets",
    `/control/sets/${input.id}`,
    "/control/operations",
    "/products",
    "/orders"
  );
}

export async function upsertControlAccessGrant(formData: FormData) {
  const sourceId = optionalFormId(formData, "grantId");
  const returnPath = sourceId
    ? `/control/administrators/${sourceId}`
    : "/control/administrators/new";
  const { user } = await requireControlPermission("manage_admins", returnPath);
  const input = controlAccessGrantFromForm(formData);
  const { data, error } = await createServiceClient().rpc("admin_upsert_access_grant", {
    p_grant_id: input.grantId,
    p_email: input.email,
    p_role: input.role,
    p_active: input.active,
    p_actor_auth_user_id: user.id,
  });

  if (error) throw new Error(`Administrator access update failed: ${error.message}`);
  const grantId = readRpcId(data, "grant_id") ?? input.grantId;
  if (!grantId) {
    throw new Error("Administrator access update failed: the database did not return a grant ID");
  }

  revalidateControlPaths(
    "/control/administrators",
    `/control/administrators/${grantId}`,
    "/control/audit"
  );
  redirect(`/control/administrators/${grantId}?saved=1`);
}

function redirectToCategoryConflict(
  input: {
    categoryId: string | null;
    name: string;
    publisher: string | null;
    parentId: string | null;
    sortOrder: number;
    active: boolean;
  },
  existingName: string
): never {
  const search = new URLSearchParams({
    error: "duplicate-category",
    name: input.name,
    existing: existingName,
    sortOrder: String(input.sortOrder),
    active: String(input.active),
  });
  if (input.publisher) search.set("publisher", input.publisher);
  if (input.parentId) search.set("parentId", input.parentId);
  const path = input.categoryId
    ? `/control/categories/${input.categoryId}`
    : "/control/categories/new";
  redirect(`${path}?${search.toString()}`);
}

function redirectToSetConflict(input: {
  setId: string | null;
  name: string;
  categoryId: string;
}): never {
  const search = new URLSearchParams({
    error: "duplicate-set",
    name: input.name,
    categoryId: input.categoryId,
  });
  const path = input.setId ? `/control/sets/${input.setId}` : "/control/sets/new";
  redirect(`${path}?${search.toString()}`);
}

function readRpcId(data: unknown, key: string): string | null {
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== "object") return null;
  const value = (row as Record<string, unknown>)[key];
  return typeof value === "string" && value ? value : null;
}

function optionalFormId(formData: FormData, key: string): string | null {
  const value = formData.get(key);
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function revalidateControlPaths(...paths: string[]) {
  revalidatePath("/control");
  for (const path of paths) revalidatePath(path);
}
