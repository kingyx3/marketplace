import { NextResponse } from "next/server";
import { toErrorResponse } from "@/lib/api/errors";
import { requireApiCustomer } from "@/lib/api/auth";
import { readJsonBody } from "@/lib/api/request";
import { createCheckoutPayment } from "@/lib/checkout";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const auth = await requireApiCustomer(request);
    const result = await createCheckoutPayment(auth, await readJsonBody(request));
    return NextResponse.json(
      {
        mode: result.mode,
        orderId: result.orderId,
        preorderId: result.preorderId,
        paymentId: result.paymentId,
        paymentIntentId: result.paymentIntentId,
        clientSecret: result.clientSecret,
        amountCents: result.amountCents,
        currency: result.publishableCurrency,
        quote: result.quote,
      },
      { status: 201 }
    );
  } catch (error) {
    return toErrorResponse(error);
  }
}
