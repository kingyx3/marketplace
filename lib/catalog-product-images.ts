export const PRODUCT_IMAGE_BUCKET = "product-images";
export const MAX_PRODUCT_IMAGE_BYTES = 6 * 1024 * 1024;

export const PRODUCT_IMAGE_CONTENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
] as const;

export type ProductImageContentType = (typeof PRODUCT_IMAGE_CONTENT_TYPES)[number];

const extensionByContentType: Record<ProductImageContentType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
};

export function isProductImageContentType(value: string): value is ProductImageContentType {
  return PRODUCT_IMAGE_CONTENT_TYPES.some((contentType) => contentType === value);
}

export function productImageExtension(contentType: ProductImageContentType): string {
  return extensionByContentType[contentType];
}

export function productImagePathBelongsToProduct(path: string, productId: string): boolean {
  const prefix = `${productId}/`;
  if (!path.startsWith(prefix)) return false;

  const fileName = path.slice(prefix.length);
  return /^[0-9a-f-]{36}\.(?:jpg|png|webp|avif)$/i.test(fileName);
}

export function formatProductImageLimit(): string {
  return `${MAX_PRODUCT_IMAGE_BYTES / (1024 * 1024)} MB`;
}
