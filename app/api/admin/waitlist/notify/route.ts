import { NextResponse } from "next/server";
import { z } from "zod";

import { requireApiPermission } from "@/lib/api/auth";
import { toErrorResponse } from "@/lib/api/errors";
import { readJsonBody } from "@/lib/api/request";
import { notifyDropForProduct } from "@/lib/waitlist";

export const dynamic = "force-dynamic";

const notifyRequestSchema = z.object({
  productId: z.string().uuid(),
});

export async function POST(request: Request) {
  try {
    const auth = await requireApiPermission(request, "communications.manage");
    const input = notifyRequestSchema.parse(await readJsonBody(request));
    const results = await notifyDropForProduct(auth.supabase, input.productId);
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
