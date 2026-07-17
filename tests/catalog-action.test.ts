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

import {
  createCatalogProduct,
  initialCatalogProductActionState,
} from "@/app/actions/catalog";

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
    expect(rpc).toHaveBeenCalledWith("admin_create_catalog_product_with_category", {
      p_category_id: null,
      p_new_category_slug: "pokemon",
      p_new_category_name: "Pokémon",
      p_new_category_publisher: "The Pokémon Company",
      p_set_id: null,
      p_slug: "pokemon-booster-box",
      p_name: "Pokémon Booster Box",
      p_product_type: "booster_box",
      p_description: null,
      p_language: "EN",
      p_image_url: null,
      p_active: true,
      p_actor_auth_user_id: "staff-user-123",
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/control/catalog");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/catalog");
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
    ...overrides,
  };
  const formData = new FormData();
  for (const [key, value] of Object.entries(values)) formData.set(key, value);
  return formData;
}
