import { NextResponse } from "next/server";

import { requireApiPermission } from "@/lib/api/auth";
import { toErrorResponse } from "@/lib/api/errors";
import { readJsonBody } from "@/lib/api/request";
import { createHitPayClient } from "@/lib/hitpay";
import { executePreorderAllocationForProduct, preorderAllocationRequestSchema } from "@/lib/preorders";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const auth = await requireApiPermission(request, "preorders.allocate");
    await requireApiPermission(request, "refunds.manage", auth.supabase);
    const input = preorderAllocationRequestSchema.parse(await readJsonBody(request));
    const result = await executePreorderAllocationForProduct(auth.supabase, createHitPayClient(), {
      productId: input.productId,
      fingerprint: input.fingerprint,
      actor: `admin:${auth.user.id}`,
    });
    return NextResponse.json(result);
  } catch (error) {
    return toErrorResponse(error);
  }
}
