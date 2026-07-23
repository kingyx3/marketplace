import { NextResponse } from "next/server";

import { requireApiCustomer } from "@/lib/api/auth";
import { withApiHandler } from "@/lib/api/handler";
import { readJsonBody } from "@/lib/api/request";
import { cancelPendingCheckoutPayment } from "@/lib/checkout";

export const dynamic = "force-dynamic";

export const POST = withApiHandler(
  "/api/checkout/cancel",
  async (request, context) => {
    const auth = await requireApiCustomer(request);
    context.setActor(auth.user.id);
    const result = await cancelPendingCheckoutPayment(
      auth,
      await readJsonBody(request),
    );
    return NextResponse.json(result);
  },
);
