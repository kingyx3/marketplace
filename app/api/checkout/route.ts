import { NextResponse } from "next/server";
import { toErrorResponse } from "@/lib/api/errors";
import { requireApiCustomer } from "@/lib/api/auth";
import { readJsonBody } from "@/lib/api/request";
import { checkoutResponseBody, createCheckoutPayment } from "@/lib/order-checkout";
import { logInfo, requestIdFrom, withRequestId } from "@/lib/observability";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const requestId = requestIdFrom(request);
  const startedAt = Date.now();
  const context = { requestId, route: "/api/checkout", method: "POST" };

  try {
    const auth = await requireApiCustomer(request);
    const result = await createCheckoutPayment(auth, await readJsonBody(request));
    logInfo("checkout.payment_created", {
      ...context,
      userId: auth.user.id,
      orderId: result.orderId,
      preorderId: result.preorderId,
      paymentId: result.paymentId,
      mode: result.mode,
      amountCents: result.amountCents,
      currency: result.publishableCurrency,
      durationMs: Date.now() - startedAt,
    });
    return withRequestId(
      NextResponse.json(checkoutResponseBody(result), { status: 201 }),
      requestId
    );
  } catch (error) {
    return toErrorResponse(error, {
      ...context,
      durationMs: Date.now() - startedAt,
    });
  }
}
