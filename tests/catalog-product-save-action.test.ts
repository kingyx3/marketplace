import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireControlPermission: vi.fn(),
  createServiceClient: vi.fn(),
  revalidatePath: vi.fn(),
  logError: vi.fn(),
  logWarn: vi.fn(),
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

vi.mock("@/lib/observability", () => ({
  logError: mocks.logError,
  logWarn: mocks.logWarn,
}));

import { saveCatalogProduct } from "@/app/actions/catalog-product-save";
import { initialCatalogProductActionState } from "@/lib/catalog-product-action-state";

const productId = "11111111-1111-4111-8111-111111111111";
const categoryId = "22222222-2222-4222-8222-222222222222";
const setId = "33333333-3333-4333-8333-333333333333";

describe("catalog product save action", () => {
  beforeEach(() => {
    mocks.requireControlPermission.mockReset();
    mocks.createServiceClient.mockReset();
    mocks.revalidatePath.mockReset();
    mocks.logError.mockReset();
    mocks.logWarn.mockReset();
    mocks.requireControlPermission.mockResolvedValue({ user: { id: "staff-user-123" } });
  });

  it("returns visible success feedback after publishing a product", async () => {
    const rpc = vi.fn(async () => ({ data: productId, error: null }));
    mocks.createServiceClient.mockReturnValue({ rpc });

    const result = await saveCatalogProduct(
      initialCatalogProductActionState,
      productForm({ published: true })
    );

    expect(result).toEqual({
      status: "success",
      message:
        "Product saved. Publication is enabled. Storefront visibility also requires an active product and an active SKU with a positive price.",
    });
    expect(rpc).toHaveBeenCalledWith(
      "admin_upsert_catalog_product_with_publication",
      expect.objectContaining({
        p_product_id: productId,
        p_published: true,
        p_actor: "staff:staff-user-123",
      })
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith(
      `/control/operations/products/${productId}`
    );
  });

  it("returns an actionable error instead of throwing when publication fails", async () => {
    const rpc = vi.fn(async () => ({
      data: null,
      error: {
        code: "42702",
        message: 'column reference "product_id" is ambiguous',
      },
    }));
    mocks.createServiceClient.mockReturnValue({ rpc });

    const result = await saveCatalogProduct(
      initialCatalogProductActionState,
      productForm({ published: true })
    );

    expect(result).toEqual({
      status: "error",
      message:
        "Product publication could not be saved because the database publication function is outdated. Deploy the latest migration and try again.",
    });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
    expect(mocks.logError).toHaveBeenCalledWith(
      "catalog.product_save_failed",
      expect.objectContaining({ code: "42702" }),
      expect.objectContaining({ productId, published: true })
    );
  });

  it("preserves an explicit unpublished selection", async () => {
    const rpc = vi.fn(async () => ({ data: productId, error: null }));
    mocks.createServiceClient.mockReturnValue({ rpc });

    const result = await saveCatalogProduct(
      initialCatalogProductActionState,
      productForm({ published: false })
    );

    expect(result.message).toBe("Product saved as not published.");
    expect(rpc).toHaveBeenCalledWith(
      "admin_upsert_catalog_product_with_publication",
      expect.objectContaining({ p_published: false })
    );
  });
});

function productForm({ published }: { published: boolean }): FormData {
  const formData = new FormData();
  formData.set("productId", productId);
  formData.set("name", "Pokémon Destined Rivals Booster Box");
  formData.set("categoryId", categoryId);
  formData.set("setId", setId);
  formData.set("productType", "booster_box");
  formData.set("description", "English booster box containing 36 packs.");
  formData.set("language", "EN");
  formData.set("imageUrl", "");
  formData.append("active", "false");
  formData.append("active", "true");
  formData.append("published", "false");
  if (published) formData.append("published", "true");
  return formData;
}
