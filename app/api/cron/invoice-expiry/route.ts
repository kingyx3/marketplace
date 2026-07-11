import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: { code: "CRON_NOT_CONFIGURED", message: "Cron authentication is not configured" } },
      { status: 503 }
    );
  }

  if (!authorized(request.headers.get("authorization"), secret)) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Unauthorized" } },
      { status: 401 }
    );
  }

  const { data, error } = await createServiceClient().rpc("expire_stale_invoice_orders", {
    p_limit: 500,
  });

  if (error) {
    console.error("invoice expiry cron failed:", error.message);
    return NextResponse.json(
      { error: { code: "INVOICE_EXPIRY_FAILED", message: "Invoice expiry failed" } },
      { status: 500 }
    );
  }

  return NextResponse.json({ expiredOrders: Number(data ?? 0) });
}

function authorized(header: string | null, secret: string): boolean {
  const expected = Buffer.from(`Bearer ${secret}`);
  const received = Buffer.from(header ?? "");
  return received.length === expected.length && timingSafeEqual(received, expected);
}
