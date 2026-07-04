import { NextResponse } from "next/server";
import { toErrorResponse } from "@/lib/api/errors";
import { requireApiAdmin } from "@/lib/api/auth";
import { listAdminOrderExceptions } from "@/lib/orders";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const auth = await requireApiAdmin(request);
    const exceptions = await listAdminOrderExceptions(auth.supabase);
    return NextResponse.json({ exceptions });
  } catch (error) {
    return toErrorResponse(error);
  }
}
