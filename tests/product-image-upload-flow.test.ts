import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("product image upload flow", () => {
  it("uploads images directly to storage instead of sending file bodies through Server Actions", async () => {
    const [page, editor, uploader, route, constraints, migration, nextConfig] = await Promise.all([
      readFile(
        new URL(
          "../app/(shop)/control/operations/products/[productId]/page.tsx",
          import.meta.url
        ),
        "utf8"
      ),
      readFile(
        new URL(
          "../app/(shop)/control/_components/catalog-product-details-editor.tsx",
          import.meta.url
        ),
        "utf8"
      ),
      readFile(
        new URL(
          "../app/(shop)/control/_components/product-image-uploader.tsx",
          import.meta.url
        ),
        "utf8"
      ),
      readFile(
        new URL("../app/api/control/product-image-upload/route.ts", import.meta.url),
        "utf8"
      ),
      readFile(new URL("../lib/catalog-product-images.ts", import.meta.url), "utf8"),
      readFile(
        new URL(
          "../supabase/migrations/20260719204500_secure_product_image_uploads.sql",
          import.meta.url
        ),
        "utf8"
      ),
      readFile(new URL("../next.config.ts", import.meta.url), "utf8"),
    ]);

    expect(page).toContain("CatalogProductDetailsEditor");
    expect(editor).toContain("ProductImageUploader");
    expect(editor).not.toContain("uploadCatalogProductImage");

    expect(uploader).toContain('"/api/control/product-image-upload"');
    expect(uploader).toContain('method: "PUT"');
    expect(uploader).toContain("uploadToSignedUrl");
    expect(uploader).not.toContain("new FormData(form).get(\"image\")");

    expect(route).toContain('requireApiPermission(request, "manage_catalog")');
    expect(route).toContain("createSignedUploadUrl");
    expect(route).toContain("admin_set_product_image");
    expect(route).toContain("productImagePathBelongsToProduct");

    expect(constraints).toContain("6 * 1024 * 1024");
    expect(constraints).not.toContain("image/svg+xml");
    expect(migration).toContain("file_size_limit");
    expect(migration).toContain("allowed_mime_types");
    expect(nextConfig).not.toContain("bodySizeLimit");
  });
});
