import { NextResponse } from "next/server";

import { requireApiPermission } from "@/lib/api/auth";
import { toErrorResponse } from "@/lib/api/errors";
import { readJsonBody } from "@/lib/api/request";
import { adminOrderActionSchema, performAdminOrderAction } from "@/lib/orders";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = adminOrderActionSchema.parse(await readJsonBody(request));
    const permission =
      body.action === "record_manual_reconciliation"
        ? "payments.reconcile"
        : body.action === "mark_packing" || body.action === "ship"
          ? "fulfilment.manage"
          : "orders.manage";
    const auth = await requireApiPermission(request, permission);
    const order = await performAdminOrderAction(auth.supabase, id, body, `admin:${auth.user.id}`);
    return NextResponse.json({ order });
  } catch (error) {
    return toErrorResponse(error);
  }
}
