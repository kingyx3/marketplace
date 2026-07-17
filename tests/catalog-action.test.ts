import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireControlPermission: vi.fn(),
  createServiceClient: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/control-access", () => ({
  requireControlPermission: mocks.requireControlPermission,
}));

vi.mock("@/lib/supabase", () => ({
  createServiceClient: mocks.createServiceClient,
}));

vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
}));

import { createCatalogProduct } from "@/app/actions/catalog";
import { initialCatalogProductActionState } from "@/lib/catalog-product-action-state";

describe("catalog product action", () => {
  beforeEach(() => {
    mocks.requireControlPermission.mockReset();
    mocks.createServiceClient.mockReset();
    mocks.revalidatePath.mockReset();
    mocks.requireControlPermission.mockResolvedValue({ user: { id: "staff-user-123" } });
  });

  it("creates a product and missing category atomically", async () => {
    const rpc = vi.fn(async () => ({
      data: [
        {
          product_id: "product-123",
          category_id: "category-123",
          category_name: "Pokémon",
          category_created: true,
          set_id: null,
          set_name: null,
          set_created: false,
        },
      ],
      error: null,
    }));
    mocks.createServiceClient.mockReturnValue({ rpc });

    const result = await createCatalogProduct(
      initialCatalogProductActionState,
      productForm({
        categoryMode: "new",
        newCategoryName: "Pokémon",
        newCategorySlug: "pokemon",
        newCategoryPublisher: "The Pokémon Company",
      })
    );

    expect(result).toEqual({
      status: "success",
      message: "Product created. A new Pokémon category was created.",
    });
    expect(rpc).toHaveBeenCalledWith("admin_create_catalog_product_hierarchy", {
      p_category_id: null,
      p_new_category_slug: "pokemon",
      p_new_category_name: "Pokémon",
      p_new_category_publisher: "The Pokémon Company",
      p_set_id: null,
      p_new_set_name: null,
      p_new_set_code: null,
      p_new_set_release_date: null,
      p_new_set_status: null,
      p_slug: "pokemon-booster-box",
      p_name: "Pokémon Booster Box",
      p_product_type: "booster_box",
      p_description: null,
      p_language: "EN",
      p_image_url: null,
      p_active: true,
      p_actor_auth_user_id: "staff-user-123",
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/control/operations");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/catalog");
  });

  it("creates a missing set under the selected category in the same mutation", async () => {
    const rpc = vi.fn(async () => ({
      data: [
        {
          product_id: "product-123",
          category_id: "category-123",
          category_name: "Pokémon",
          category_created: false,
          set_id: "set-123",
          set_name: "Destined Rivals",
          set_created: true,
        },
      ],
      error: null,
    }));
    mocks.createServiceClient.mockReturnValue({ rpc });

    const result = await createCatalogProduct(
      initialCatalogProductActionState,
      productForm({
        setMode: "new",
        newSetName: "Destined Rivals",
        newSetCode: "dri",
        newSetReleaseDate: "2026-08-01",
        newSetStatus: "preorder_open",
      })
    );

    expect(result).toEqual({
      status: "success",
      message: "Product created. A new Destined Rivals set was created.",
    });
    expect(rpc).toHaveBeenCalledWith(
      "admin_create_catalog_product_hierarchy",
      expect.objectContaining({
        p_category_id: "category-123",
        p_set_id: null,
        p_new_set_name: "Destined Rivals",
        p_new_set_code: "DRI",
        p_new_set_release_date: "2026-08-01",
        p_new_set_status: "preorder_open",
      })
    );
  });

  it("keeps product input recoverable when a product slug conflicts", async () => {
    const rpc = vi.fn(async () => ({
      data: null,
      error: { code: "23505", message: "product slug already exists" },
    }));
    mocks.createServiceClient.mockReturnValue({ rpc });

    const result = await createCatalogProduct(
      initialCatalogProductActionState,
      productForm({ categoryMode: "existing", categoryId: "category-123" })
    );

    expect(result).toMatchObject({ status: "error", field: "productSlug" });
    expect(result.message).toContain("other product details are preserved");
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("surfaces a category slug conflict as a field-level correction", async () => {
    const rpc = vi.fn(async () => ({
      data: null,
      error: {
        code: "23505",
        message: 'duplicate key value violates unique constraint "tcg_categories_slug_key"',
      },
    }));
    mocks.createServiceClient.mockReturnValue({ rpc });

    const result = await createCatalogProduct(
      initialCatalogProductActionState,
      productForm({
        categoryMode: "new",
        newCategoryName: "Pokémon",
        newCategorySlug: "pokemon",
      })
    );

    expect(result).toMatchObject({ status: "error", field: "categorySlug" });
    expect(result.message).toContain("Select the existing category or enter a unique slug");
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("surfaces duplicate set codes on the set field", async () => {
    const rpc = vi.fn(async () => ({
      data: null,
      error: { code: "23505", message: "set code already exists for category; select existing set" },
    }));
    mocks.createServiceClient.mockReturnValue({ rpc });

    const result = await createCatalogProduct(
      initialCatalogProductActionState,
      productForm({ setMode: "new", newSetName: "Destined Rivals", newSetCode: "DRI" })
    );

    expect(result).toMatchObject({ status: "error", field: "setCode" });
    expect(result.message).toContain("Choose the existing set or enter a unique code");
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("returns validation feedback before any database mutation", async () => {
    const rpc = vi.fn();
    mocks.createServiceClient.mockReturnValue({ rpc });

    const result = await createCatalogProduct(
      initialCatalogProductActionState,
      productForm({ categoryMode: "new", newCategoryName: "", newCategorySlug: "" })
    );

    expect(result).toEqual({
      status: "error",
      message: "Select a category or add a new category",
    });
    expect(rpc).not.toHaveBeenCalled();
  });
});

function productForm(overrides: Record<string, string> = {}): FormData {
  const values: Record<string, string> = {
    categoryMode: "existing",
    categoryId: "category-123",
    setMode: "none",
    setId: "",
    slug: "pokemon-booster-box",
    name: "Pokémon Booster Box",
    productType: "booster_box",
    description: "",
    language: "EN",
    imageUrl: "",
    active: "true",
    newCategoryName: "",
    newCategorySlug: "",
    newCategoryPublisher: "",
    newSetName: "",
    newSetCode: "",
    newSetReleaseDate: "",
    newSetStatus: "",
    ...overrides,
  };
  const formData = new FormData();
  for (const [key, value] of Object.entries(values)) formData.set(key, value);
  return formData;
}
