import { NextResponse } from "next/server";
import { toErrorResponse } from "@/lib/api/errors";
import { requireApiAdmin } from "@/lib/api/auth";
import { readJsonBody } from "@/lib/api/request";
import { performAdminOrderAction } from "@/lib/orders";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireApiAdmin(request);
    const { id } = await context.params;
    const order = await performAdminOrderAction(
      auth.supabase,
      id,
      await readJsonBody(request),
      `admin:${auth.user.id}`
    );
    return NextResponse.json({ order });
  } catch (error) {
    return toErrorResponse(error);
  }
}
