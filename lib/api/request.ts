import { badRequest, payloadTooLarge, unsupportedMediaType } from "@/lib/api/errors";

const defaultMaxJsonBytes = 64 * 1024;

export interface ReadJsonBodyOptions {
  maxBytes?: number;
  allowEmpty?: boolean;
}

export async function readJsonBody(
  request: Request,
  options: ReadJsonBodyOptions = {}
): Promise<unknown> {
  const maxBytes = options.maxBytes ?? defaultMaxJsonBytes;
  const contentType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (contentType !== "application/json") {
    throw unsupportedMediaType();
  }

  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw payloadTooLarge();
  }

  const rawBody = await request.text();
  if (new TextEncoder().encode(rawBody).byteLength > maxBytes) {
    throw payloadTooLarge();
  }
  if (!rawBody.trim()) {
    if (options.allowEmpty) return undefined;
    throw badRequest("JSON body is required");
  }

  try {
    return JSON.parse(rawBody) as unknown;
  } catch {
    throw badRequest("Invalid JSON body");
  }
}
