import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";

import { requireApiPermission } from "@/lib/api/auth";
import { badRequest, notFound, toErrorResponse } from "@/lib/api/errors";
import {
  MAX_PRODUCT_IMAGE_BYTES,
  PRODUCT_IMAGE_BUCKET,
  PRODUCT_IMAGE_CONTENT_TYPES,
  isProductImageContentType,
  productImageExtension,
  productImagePathBelongsToProduct,
} from "@/lib/catalog-product-images";

export const dynamic = "force-dynamic";

const createUploadSchema = z.object({
  productId: z.string().uuid(),
  contentType: z.enum(PRODUCT_IMAGE_CONTENT_TYPES),
  sizeBytes: z.number().int().positive().max(MAX_PRODUCT_IMAGE_BYTES),
});

const finalizeUploadSchema = z.object({
  productId: z.string().uuid(),
  path: z.string().trim().min(1).max(512),
});

export async function POST(request: Request) {
  try {
    const auth = await requireApiPermission(request, "catalog.manage");
    const input = createUploadSchema.parse(await request.json());
    await assertProductExists(auth.supabase, input.productId);

    const extension = productImageExtension(input.contentType);
    const path = `${input.productId}/${randomUUID()}.${extension}`;
    const bucket = auth.supabase.storage.from(PRODUCT_IMAGE_BUCKET);
    const { data, error } = await bucket.createSignedUploadUrl(path);

    if (error || !data?.signedUrl) {
      throw new Error(error?.message ?? "Signed product image upload URL was not created");
    }

    return NextResponse.json({
      path,
      uploadUrl: data.signedUrl,
      maxSizeBytes: MAX_PRODUCT_IMAGE_BYTES,
    });
  } catch (error) {
    return toErrorResponse(error, {
      route: "/api/control/product-image-upload",
      operation: "create",
    });
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await requireApiPermission(request, "catalog.manage");
    const input = finalizeUploadSchema.parse(await request.json());
    await assertProductExists(auth.supabase, input.productId);

    if (!productImagePathBelongsToProduct(input.path, input.productId)) {
      throw badRequest("Invalid product image path");
    }

    const fileName = input.path.slice(input.productId.length + 1);
    const bucket = auth.supabase.storage.from(PRODUCT_IMAGE_BUCKET);
    const { data: files, error: listError } = await bucket.list(input.productId, {
      limit: 10,
      search: fileName,
    });

    if (listError) throw new Error(listError.message);

    const uploadedFile = files?.find((file) => file.name === fileName);
    if (!uploadedFile) throw notFound("Uploaded product image was not found");

    const metadata = uploadedFile.metadata as Record<string, unknown> | null;
    const storedSize = typeof metadata?.size === "number" ? metadata.size : null;
    const storedContentType = typeof metadata?.mimetype === "string" ? metadata.mimetype : null;

    if (storedSize !== null && storedSize > MAX_PRODUCT_IMAGE_BYTES) {
      await bucket.remove([input.path]);
      throw badRequest("Product image exceeds the allowed file size");
    }
    if (storedContentType && !isProductImageContentType(storedContentType)) {
      await bucket.remove([input.path]);
      throw badRequest("Product image format is not supported");
    }

    const { data: publicUrlData } = bucket.getPublicUrl(input.path);
    const { error: assignmentError } = await auth.supabase.rpc("admin_set_product_image", {
      p_product_id: input.productId,
      p_image_url: publicUrlData.publicUrl,
      p_actor: `staff:${auth.user.id}`,
    });

    if (assignmentError) throw new Error(assignmentError.message);

    return NextResponse.json({ publicUrl: publicUrlData.publicUrl });
  } catch (error) {
    return toErrorResponse(error, {
      route: "/api/control/product-image-upload",
      operation: "finalize",
    });
  }
}

async function assertProductExists(
  supabase: Awaited<ReturnType<typeof requireApiPermission>>["supabase"],
  productId: string
): Promise<void> {
  const { data, error } = await supabase
    .from("products")
    .select("id")
    .eq("id", productId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw notFound("Product not found");
}
