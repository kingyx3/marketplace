import { NextResponse } from "next/server";
import { toErrorResponse } from "@/lib/api/errors";
import { requireApiCustomer } from "@/lib/api/auth";
import { readJsonBody } from "@/lib/api/request";
import { cancelPendingCheckoutPayment } from "@/lib/checkout";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const auth = await requireApiCustomer(request);
    const result = await cancelPendingCheckoutPayment(auth, await readJsonBody(request));
    return NextResponse.json(result);
  } catch (error) {
    return toErrorResponse(error);
  }
}
