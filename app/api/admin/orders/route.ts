import { NextResponse } from "next/server";
import { toErrorResponse } from "@/lib/api/errors";
import { requireApiAdmin } from "@/lib/api/auth";
import { listAdminOrders, listQuerySchema } from "@/lib/orders";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const auth = await requireApiAdmin(request);
    const query = listQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    const orders = await listAdminOrders(auth.supabase, query.limit);
    return NextResponse.json({ orders });
  } catch (error) {
    return toErrorResponse(error);
  }
}
