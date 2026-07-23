import { NextResponse } from "next/server";

import { requireApiCustomer } from "@/lib/api/auth";
import { withApiHandler } from "@/lib/api/handler";
import { requireIdempotencyKey, runIdempotentJsonOperation } from "@/lib/api/idempotency";
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

    const body = await readJsonBody(request, { maxBytes: 32 * 1024 });
    const operation = await runIdempotentJsonOperation(
      auth.supabase,
      {
        scope: "checkout.create",
        actorId: auth.user.id,
        key: requireIdempotencyKey(request),
        requestBody: body,
        requestId: context.requestId,
        ttlSeconds: 60 * 60,
      },
      async () => {
        const result = await createCheckoutPayment(
          auth,
          body,
          undefined,
          new URL(request.url).origin,
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
        return { status: 201, body: checkoutResponseBody(result) };
      }
    );

    if (operation.replayed) {
      logInfo("api.idempotency.replayed", {
        ...context,
        scope: "checkout.create",
      });
    }

    return NextResponse.json(operation.body, { status: operation.status });
  },
  { timeoutMs: 25_000 }
);
