import { NextResponse } from "next/server";
import { toErrorResponse } from "@/lib/api/errors";
import { requireApiCustomer } from "@/lib/api/auth";
import { readJsonBody } from "@/lib/api/request";
import { checkoutResponseBody, createCheckoutPayment } from "@/lib/order-checkout";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const auth = await requireApiCustomer(request);
    const result = await createCheckoutPayment(auth, await readJsonBody(request));
    return NextResponse.json(checkoutResponseBody(result), { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
