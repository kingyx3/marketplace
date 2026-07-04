import { badRequest } from "@/lib/api/errors";

export async function readJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw badRequest("Invalid JSON body");
  }
}

