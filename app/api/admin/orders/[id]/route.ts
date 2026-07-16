import { NextResponse } from "next/server";

import { requireApiPermission } from "@/lib/api/auth";
import { toErrorResponse } from "@/lib/api/errors";
import { readJsonBody } from "@/lib/api/request";
import { performAdminOrderAction } from "@/lib/orders";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireApiPermission(request, "manage_orders");
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
