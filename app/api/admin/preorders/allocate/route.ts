import { NextResponse } from "next/server";

import { requireApiPermission } from "@/lib/api/auth";
import { toErrorResponse } from "@/lib/api/errors";
import { readJsonBody } from "@/lib/api/request";
import { preorderAllocationRequestSchema, runPreorderAllocationForSku } from "@/lib/preorders";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const auth = await requireApiPermission(request, "manage_full_operations");
    const input = preorderAllocationRequestSchema.parse(await readJsonBody(request));
    const allocations = await runPreorderAllocationForSku(
      auth.supabase,
      input.skuId,
      `admin:${auth.user.id}`
    );
    return NextResponse.json({ allocations });
  } catch (error) {
    return toErrorResponse(error);
  }
}
