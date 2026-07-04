import { NextResponse } from "next/server";
import { toErrorResponse } from "@/lib/api/errors";
import { requireApiCustomer } from "@/lib/api/auth";
import { getCustomerOrder } from "@/lib/orders";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireApiCustomer(request);
    const { id } = await context.params;
    const order = await getCustomerOrder(auth.supabase, auth.customer, id);
    return NextResponse.json({ order });
  } catch (error) {
    return toErrorResponse(error);
  }
}
