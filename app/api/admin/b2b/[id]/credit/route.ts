import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiAdmin } from "@/lib/api/auth";
import { toErrorResponse } from "@/lib/api/errors";
import { readJsonBody } from "@/lib/api/request";
import { logInfo, requestIdFrom, withRequestId } from "@/lib/observability";

export const dynamic = "force-dynamic";

const creditTermsSchema = z
  .object({
    paymentTerms: z
      .string()
      .trim()
      .regex(/^NET(?:[1-9]|[1-8][0-9]|90)$/i, "Payment terms must be NET1 through NET90")
      .transform((value) => value.toUpperCase()),
    creditLimitCents: z.number().int().min(1).max(1_000_000_000),
  })
  .strict();

export async function PUT(
  request: Request,
  routeContext: { params: Promise<{ id: string }> }
) {
  const requestId = requestIdFrom(request);
  const startedAt = Date.now();
  const context = {
    requestId,
    route: "/api/admin/b2b/[id]/credit",
    method: "PUT",
  };

  try {
    const auth = await requireApiAdmin(request);
    const { id } = await routeContext.params;
    const input = creditTermsSchema.parse(await readJsonBody(request));

    const { error } = await auth.supabase.rpc("admin_set_b2b_credit_terms", {
      p_account_id: id,
      p_payment_terms: input.paymentTerms,
      p_credit_limit_cents: input.creditLimitCents,
      p_actor: `staff:${auth.user.id}`,
    });

    if (error) {
      throw new Error(error.message);
    }

    logInfo("admin.b2b_credit.updated", {
      ...context,
      userId: auth.user.id,
      accountId: id,
      paymentTerms: input.paymentTerms,
      creditLimitCents: input.creditLimitCents,
      durationMs: Date.now() - startedAt,
    });

    return withRequestId(
      NextResponse.json({
        accountId: id,
        paymentTerms: input.paymentTerms,
        creditLimitCents: input.creditLimitCents,
      }),
      requestId
    );
  } catch (error) {
    return toErrorResponse(error, {
      ...context,
      durationMs: Date.now() - startedAt,
    });
  }
}
