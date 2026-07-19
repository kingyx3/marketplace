import { NextResponse } from "next/server";

import { requireApiCustomer } from "@/lib/api/auth";
import { withApiHandler } from "@/lib/api/handler";
import { enforceRateLimit } from "@/lib/api/rate-limit";
import { readJsonBody } from "@/lib/api/request";
import { checkoutResponseBody, createCheckoutPayment } from "@/lib/order-checkout";
import { logInfo } from "@/lib/observability";

export const dynamic = "force-dynamic";

export const POST = withApiHandler(
  "/api/checkout",
  async (request, context) => {
    const auth = await requireApiCustomer(request);
    context.setActor(auth.user.id);
    await enforceRateLimit(auth.supabase, {
      scope: "checkout.create",
      identifier: auth.customer.id,
      limit: 8,
      windowSeconds: 5 * 60,
      requestId: context.requestId,
    });

    const result = await createCheckoutPayment(
      auth,
      await readJsonBody(request, { maxBytes: 32 * 1024 })
    );
    logInfo("checkout.payment_created", {
      ...context,
      orderId: result.orderId,
      preorderId: result.preorderId,
      paymentId: result.paymentId,
      mode: result.mode,
      amountCents: result.amountCents,
      currency: result.publishableCurrency,
    });
    return NextResponse.json(checkoutResponseBody(result), { status: 201 });
  },
  { timeoutMs: 25_000 }
);
