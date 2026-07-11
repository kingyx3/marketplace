import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiAdmin } from "@/lib/api/auth";
import { toErrorResponse } from "@/lib/api/errors";
import { readJsonBody } from "@/lib/api/request";

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
  context: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireApiAdmin(request);
    const { id } = await context.params;
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

    return NextResponse.json({
      accountId: id,
      paymentTerms: input.paymentTerms,
      creditLimitCents: input.creditLimitCents,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
