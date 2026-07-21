import { NextResponse } from "next/server";

import { requireApiPermission } from "@/lib/api/auth";
import { toErrorResponse } from "@/lib/api/errors";
import { listAdminOrderExceptions } from "@/lib/order-exceptions";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const auth = await requireApiPermission(request, "orders.view");
    const exceptions = await listAdminOrderExceptions(auth.supabase);
    return NextResponse.json({ exceptions });
  } catch (error) {
    return toErrorResponse(error);
  }
}
