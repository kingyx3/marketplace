import { NextResponse } from "next/server";
import { toErrorResponse } from "@/lib/api/errors";
import { requireApiCustomer } from "@/lib/api/auth";
import { getCustomerPreorder } from "@/lib/orders";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireApiCustomer(request);
    const { id } = await context.params;
    const preorder = await getCustomerPreorder(auth.supabase, auth.customer, id);
    return NextResponse.json({ preorder });
  } catch (error) {
    return toErrorResponse(error);
  }
}
