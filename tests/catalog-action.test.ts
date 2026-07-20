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

  it("creates a named product and missing hierarchy atomically", async () => {
    const rpc = vi.fn(async () => ({
      data: [
        {
          product_id: "product-123",
          product_slug: "pokemon-base-set-booster-box",
          category_id: "category-123",
          category_name: "Pokémon",
          category_created: true,
          set_id: "set-123",
          set_name: "Base Set",
          set_created: true,
          product_type_code: "booster_box",
          product_type_name: "Booster box",
          product_type_created: false,
        },
      ],
      error: null,
    }));
    mocks.createServiceClient.mockReturnValue({ rpc });

    const result = await createCatalogProduct(
      initialCatalogProductActionState,
      productForm({
        name: "Pokémon Base Set Booster Box",
        categoryMode: "new",
        newCategoryName: "Pokémon",
        newCategoryPublisher: "The Pokémon Company",
        setMode: "new",
        newSetName: "Base Set",
      })
    );

    expect(result).toEqual({
      status: "success",
      message:
        "Product created. A new Pokémon category was created. A new Base Set set was created. Slug: pokemon-base-set-booster-box.",
    });
    expect(rpc).toHaveBeenCalledWith("admin_create_catalog_product_hierarchy", {
      p_category_id: null,
      p_new_category_slug: "pokemon",
      p_new_category_name: "Pokémon",
      p_new_category_publisher: "The Pokémon Company",
      p_set_id: null,
      p_new_set_name: "Base Set",
      p_new_set_code: "BASE-SET",
      p_new_set_release_date: null,
      p_new_set_status: "announced",
      p_product_type: "booster_box",
      p_new_product_type_name: null,
      p_new_product_type_code: null,
      p_name: "Pokémon Base Set Booster Box",
      p_description: null,
      p_language: "EN",
      p_image_url: null,
      p_active: true,
      p_actor_auth_user_id: "staff-user-123",
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/control/catalog");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/products");
  });

  it("creates a draft product without accepting publication authority", async () => {
    const rpc = vi.fn(async () => ({
      data: [{ product_id: "product-123", product_slug: "hidden-product" }],
      error: null,
    }));
    mocks.createServiceClient.mockReturnValue({ rpc });

    await createCatalogProduct(
      initialCatalogProductActionState,
      productForm({ name: "Hidden Product", published: "false" })
    );

    expect(rpc).toHaveBeenCalledWith(
      "admin_create_catalog_product_hierarchy",
      expect.not.objectContaining({ p_published: expect.anything() })
    );
  });

  it("creates a missing set under the selected category in the same mutation", async () => {
    const rpc = vi.fn(async () => ({
      data: [
        {
          product_id: "product-123",
          product_slug: "pokemon-destined-rivals-booster-box",
          category_id: "category-123",
          category_name: "Pokémon",
          category_created: false,
          set_id: "set-123",
          set_name: "Destined Rivals",
          set_created: true,
          product_type_code: "booster_box",
          product_type_name: "Booster box",
          product_type_created: false,
        },
      ],
      error: null,
    }));
    mocks.createServiceClient.mockReturnValue({ rpc });

    const result = await createCatalogProduct(
      initialCatalogProductActionState,
      productForm({
        setMode: "new",
        setId: "",
        newSetName: "Destined Rivals",
        newSetReleaseDate: "2026-08-01",
        newSetStatus: "preorder_open",
      })
    );

    expect(result).toEqual({
      status: "success",
      message:
        "Product created. A new Destined Rivals set was created. Slug: pokemon-destined-rivals-booster-box.",
    });
    expect(rpc).toHaveBeenCalledWith(
      "admin_create_catalog_product_hierarchy",
      expect.objectContaining({
        p_name: "Pokémon Destined Rivals Booster Box",
        p_category_id: "category-123",
        p_set_id: null,
        p_new_set_name: "Destined Rivals",
        p_new_set_code: "DESTINED-RIVALS",
        p_new_set_release_date: "2026-08-01",
        p_new_set_status: "preorder_open",
      })
    );
  });

  it("adds a new reusable product type inline without deriving the display name from it", async () => {
    const rpc = vi.fn(async () => ({
      data: [
        {
          product_id: "product-123",
          product_slug: "pokemon-destined-rivals-premium-collection-box",
          category_id: "category-123",
          category_name: "Pokémon",
          category_created: false,
          set_id: "set-123",
          set_name: "Destined Rivals",
          set_created: false,
          product_type_code: "premium_collection_box",
          product_type_name: "Premium Collection Box",
          product_type_created: true,
        },
      ],
      error: null,
    }));
    mocks.createServiceClient.mockReturnValue({ rpc });

    const result = await createCatalogProduct(
      initialCatalogProductActionState,
      productForm({
        name: "Pokémon Destined Rivals Premium Collection Box",
        productTypeMode: "new",
        productType: "",
        newProductTypeName: "Premium Collection Box",
      })
    );

    expect(result).toEqual({
      status: "success",
      message:
        "Product created. Premium Collection Box was added to the product type list. Slug: pokemon-destined-rivals-premium-collection-box.",
    });
    expect(rpc).toHaveBeenCalledWith(
      "admin_create_catalog_product_hierarchy",
      expect.objectContaining({
        p_name: "Pokémon Destined Rivals Premium Collection Box",
        p_product_type: null,
        p_new_product_type_name: "Premium Collection Box",
        p_new_product_type_code: "premium_collection_box",
      })
    );
  });

  it("keeps product input recoverable when the structured identity conflicts", async () => {
    const rpc = vi.fn(async () => ({
      data: null,
      error: {
        code: "23505",
        message: "product already exists for this category, set, type, and language",
      },
    }));
    mocks.createServiceClient.mockReturnValue({ rpc });

    const result = await createCatalogProduct(initialCatalogProductActionState, productForm());

    expect(result).toMatchObject({ status: "error", field: "productIdentity" });
    expect(result.message).toContain("category, set, type, and language");
    expect(result.message).toContain("other product details are preserved");
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("surfaces a display-name slug conflict on the display-name field", async () => {
    const rpc = vi.fn(async () => ({
      data: null,
      error: {
        code: "23505",
        message: "product display name generates a slug already used by another product",
      },
    }));
    mocks.createServiceClient.mockReturnValue({ rpc });

    const result = await createCatalogProduct(initialCatalogProductActionState, productForm());

    expect(result).toMatchObject({ status: "error", field: "name" });
    expect(result.message).toContain("Choose a distinct display name");
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("surfaces a generated category slug conflict without discarding product input", async () => {
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
        categoryId: "",
        newCategoryName: "Pokémon",
        setMode: "new",
        setId: "",
        newSetName: "Base Set",
      })
    );

    expect(result).toMatchObject({ status: "error", field: "productIdentity" });
    expect(result.message).toContain("Select the existing record or change the conflicting value");
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("surfaces duplicate generated set codes on the set name", async () => {
    const rpc = vi.fn(async () => ({
      data: null,
      error: {
        code: "23505",
        message: "set code already exists for category; select existing set",
      },
    }));
    mocks.createServiceClient.mockReturnValue({ rpc });

    const result = await createCatalogProduct(
      initialCatalogProductActionState,
      productForm({ setMode: "new", setId: "", newSetName: "Destined Rivals" })
    );

    expect(result).toMatchObject({ status: "error", field: "setCode" });
    expect(result.message).toContain("Choose the existing set or rename the new set");
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("requires a set before any database mutation", async () => {
    const rpc = vi.fn();
    mocks.createServiceClient.mockReturnValue({ rpc });

    const result = await createCatalogProduct(
      initialCatalogProductActionState,
      productForm({ setMode: "existing", setId: "" })
    );

    expect(result).toEqual({
      status: "error",
      message: "Select an existing set",
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("returns validation feedback before any database mutation", async () => {
    const rpc = vi.fn();
    mocks.createServiceClient.mockReturnValue({ rpc });

    const result = await createCatalogProduct(
      initialCatalogProductActionState,
      productForm({
        categoryMode: "new",
        categoryId: "",
        newCategoryName: "",
        setMode: "new",
        setId: "",
        newSetName: "Base Set",
      })
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
    name: "Pokémon Destined Rivals Booster Box",
    categoryMode: "existing",
    categoryId: "category-123",
    setMode: "existing",
    setId: "set-123",
    productTypeMode: "existing",
    productType: "booster_box",
    newProductTypeName: "",
    description: "",
    language: "EN",
    imageUrl: "",
    active: "true",
    published: "true",
    newCategoryName: "",
    newCategoryPublisher: "",
    newSetName: "",
    newSetReleaseDate: "",
    newSetStatus: "",
    ...overrides,
  };
  const formData = new FormData();
  for (const [key, value] of Object.entries(values)) formData.set(key, value);
  return formData;
}
