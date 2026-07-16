import { NextResponse } from "next/server";
import { z } from "zod";

import { requireApiPermission } from "@/lib/api/auth";
import { toErrorResponse } from "@/lib/api/errors";
import { readJsonBody } from "@/lib/api/request";
import { notifyDropForSku } from "@/lib/waitlist";

export const dynamic = "force-dynamic";

const notifyRequestSchema = z.object({
  skuId: z.string().uuid(),
});

export async function POST(request: Request) {
  try {
    const auth = await requireApiPermission(request, "manage_full_operations");
    const input = notifyRequestSchema.parse(await readJsonBody(request));
    const results = await notifyDropForSku(auth.supabase, input.skuId);
    return NextResponse.json({
      sent: results.filter((result) => result.status === "sent").length,
      skipped: results.filter((result) => result.status === "skipped").length,
      failed: results.filter((result) => result.status === "failed").length,
      duplicate: results.filter((result) => result.status === "duplicate").length,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
