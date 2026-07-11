import { NextResponse } from "next/server";
import { requireApiCustomer } from "@/lib/api/auth";
import { toErrorResponse } from "@/lib/api/errors";
import { readJsonBody } from "@/lib/api/request";
import { createInvoiceCheckout, invoiceCheckoutResponseBody } from "@/lib/order-checkout";
import { logInfo, requestIdFrom, withRequestId } from "@/lib/observability";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const requestId = requestIdFrom(request);
  const startedAt = Date.now();
  const context = { requestId, route: "/api/checkout/invoice", method: "POST" };

  try {
    const auth = await requireApiCustomer(request);
    const result = await createInvoiceCheckout(auth, await readJsonBody(request));
    logInfo("checkout.invoice_created", {
      ...context,
      userId: auth.user.id,
      orderId: result.orderId,
      paymentId: result.paymentId,
      amountCents: result.amountCents,
      currency: result.currency,
      paymentDueAt: result.paymentDueAt,
      allocationExpiresAt: result.allocationExpiresAt,
      durationMs: Date.now() - startedAt,
    });
    return withRequestId(
      NextResponse.json(invoiceCheckoutResponseBody(result), { status: 201 }),
      requestId
    );
  } catch (error) {
    return toErrorResponse(error, {
      ...context,
      durationMs: Date.now() - startedAt,
    });
  }
}
