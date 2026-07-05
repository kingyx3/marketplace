import { NextResponse } from "next/server";
import { toErrorResponse } from "@/lib/api/errors";
import { requireApiCustomer } from "@/lib/api/auth";
import { checkoutResponseBody, createPreorderBalancePayment } from "@/lib/checkout";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireApiCustomer(request);
    const { id } = await context.params;
    const result = await createPreorderBalancePayment(auth, id);
    return NextResponse.json(checkoutResponseBody(result), { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
