import { NextResponse } from "next/server";
import { toErrorResponse } from "@/lib/api/errors";
import { requireApiCustomer } from "@/lib/api/auth";
import { listCustomerPreorders, listQuerySchema } from "@/lib/orders";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const auth = await requireApiCustomer(request);
    const query = listQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    const preorders = await listCustomerPreorders(auth.supabase, auth.customer, query.limit);
    return NextResponse.json({ preorders });
  } catch (error) {
    return toErrorResponse(error);
  }
}
