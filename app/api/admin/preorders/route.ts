import { NextResponse } from "next/server";

import { requireApiPermission } from "@/lib/api/auth";
import { toErrorResponse } from "@/lib/api/errors";
import { listAdminPreorders, listQuerySchema } from "@/lib/orders";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const auth = await requireApiPermission(request, "manage_orders");
    const query = listQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    const preorders = await listAdminPreorders(auth.supabase, query.limit);
    return NextResponse.json({ preorders });
  } catch (error) {
    return toErrorResponse(error);
  }
}
