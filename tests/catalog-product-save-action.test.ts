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

  it("returns visible success feedback after saving product identity", async () => {
    const rpc = vi.fn(async () => ({ data: productId, error: null }));
    mocks.createServiceClient.mockReturnValue({ rpc });

    const result = await saveCatalogProduct(
      initialCatalogProductActionState,
      productForm({ published: true })
    );

    expect(result).toEqual({
      status: "success",
      message: "Product details saved. Pricing and storefront publication remain unchanged.",
    });
    expect(rpc).toHaveBeenCalledWith(
      "admin_upsert_catalog_product",
      expect.objectContaining({
        p_product_id: productId,
        p_actor: "staff:staff-user-123",
      })
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith(`/control/catalog/products/${productId}`);
  });

  it("returns an error reference instead of throwing when the product save fails", async () => {
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

    expect(result).toMatchObject({ status: "error" });
    expect(result.message).toContain("Product could not be saved. Error reference:");
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
    expect(mocks.logError).toHaveBeenCalledWith(
      "catalog.product_save_failed",
      expect.objectContaining({ code: "42702" }),
      expect.objectContaining({ productId })
    );
  });

  it("ignores legacy publication inputs in the Catalog save", async () => {
    const rpc = vi.fn(async () => ({ data: productId, error: null }));
    mocks.createServiceClient.mockReturnValue({ rpc });

    const result = await saveCatalogProduct(
      initialCatalogProductActionState,
      productForm({ published: false })
    );

    expect(result.message).toBe(
      "Product details saved. Pricing and storefront publication remain unchanged."
    );
    expect(rpc).toHaveBeenCalledWith(
      "admin_upsert_catalog_product",
      expect.not.objectContaining({ p_published: expect.anything() })
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
