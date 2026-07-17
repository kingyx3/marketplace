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
  const { user } = await requireControlPermission("manage_suppliers", "/control/suppliers");
  const input = controlSupplierFromForm(formData);
  const contact = {
    name: input.contactName,
    email: input.contactEmail,
    phone: input.contactPhone,
  };

  const { error } = await createServiceClient().rpc("admin_upsert_supplier", {
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
  revalidateControlPaths("/control/suppliers", "/control/operations");
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
  revalidateControlPaths("/control/suppliers", "/control/operations");
}

export async function upsertControlCategory(formData: FormData) {
  const { user } = await requireControlPermission("manage_catalog", "/control/categories");
  const input = controlCategoryFromForm(formData);
  const supabase = createServiceClient();
  let duplicateQuery = supabase
    .from("tcg_categories")
    .select("id, name, slug")
    .eq("slug", input.slug);
  if (input.categoryId) duplicateQuery = duplicateQuery.neq("id", input.categoryId);
  const { data: duplicate, error: duplicateError } = await duplicateQuery.maybeSingle();
  if (duplicateError) throw new Error(`Category duplicate check failed: ${duplicateError.message}`);
  if (duplicate) {
    await redirectToCategoryConflict(input.slug, duplicate.name, supabase);
  }

  const { error } = await supabase.rpc("admin_upsert_category", {
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

  if (error?.code === "23505") {
    await redirectToCategoryConflict(input.slug, "another category", supabase);
  }
  if (error) throw new Error(`Category save failed: ${error.message}`);
  revalidateControlPaths(
    "/control/categories",
    "/control/sets",
    "/control/operations",
    "/products"
  );
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
    "/control/sets",
    "/control/operations",
    "/products"
  );
}

export async function upsertControlSet(formData: FormData) {
  const { user } = await requireControlPermission("manage_catalog", "/control/sets");
  const input = controlSetFromForm(formData);
  const { error } = await createServiceClient().rpc("admin_upsert_set_release", {
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

  if (error) throw new Error(`Set save failed: ${error.message}`);
  revalidateControlPaths("/control/sets", "/control/operations", "/products", "/preorders");
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
  revalidateControlPaths("/control/sets", "/control/operations", "/products", "/preorders");
}

export async function upsertControlAccessGrant(formData: FormData) {
  const { user } = await requireControlPermission("manage_admins", "/control/administrators");
  const input = controlAccessGrantFromForm(formData);
  const { error } = await createServiceClient().rpc("admin_upsert_access_grant", {
    p_grant_id: input.grantId,
    p_email: input.email,
    p_role: input.role,
    p_active: input.active,
    p_actor_auth_user_id: user.id,
  });

  if (error) throw new Error(`Administrator access update failed: ${error.message}`);
  revalidateControlPaths("/control/administrators", "/control/audit");
}

async function redirectToCategoryConflict(
  slug: string,
  existingName: string,
  supabase: ReturnType<typeof createServiceClient>
): Promise<never> {
  const { data } = await supabase
    .from("tcg_categories")
    .select("slug")
    .like("slug", `${slug}%`)
    .limit(100);
  const used = new Set((data ?? []).map((row) => String(row.slug)));
  let suffix = 2;
  while (used.has(`${slug}-${suffix}`)) suffix += 1;
  const search = new URLSearchParams({
    error: "duplicate-category",
    slug,
    existing: existingName,
    suggested: `${slug}-${suffix}`,
  });
  redirect(`/control/categories?${search.toString()}`);
}

function revalidateControlPaths(...paths: string[]) {
  revalidatePath("/control");
  for (const path of paths) revalidatePath(path);
}
