import { NextResponse } from "next/server";
import { toErrorResponse } from "@/lib/api/errors";
import { requireApiAdmin } from "@/lib/api/auth";
import { readJsonBody } from "@/lib/api/request";
import { updateAdminPreorder } from "@/lib/orders";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireApiAdmin(request);
    const { id } = await context.params;
    const preorder = await updateAdminPreorder(auth.supabase, id, await readJsonBody(request));
    return NextResponse.json({ preorder });
  } catch (error) {
    return toErrorResponse(error);
  }
}
