import { NextResponse } from "next/server";

import { badRequest } from "@/lib/api/errors";
import { withApiHandler } from "@/lib/api/handler";
import { createSecretClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export const GET = withApiHandler("/api/checkout/status", async (request) => {
  const orderId = new URL(request.url).searchParams.get("order")?.trim();
  if (!orderId || !isUuid(orderId))
    throw badRequest("A valid order id is required");

  const supabase = createSecretClient();
  const order = await supabase
    .from("orders")
    .select("status, created_at")
    .eq("id", orderId)
    .maybeSingle();
  if (order.error) throw new Error(order.error.message);

  if (!order.data) {
    return NextResponse.json({
      status: "pending_confirmation",
      authoritative: true,
    });
  }
  if (["paid", "packing", "shipped", "delivered"].includes(order.data.status)) {
    return NextResponse.json({ status: "paid", authoritative: true });
  }
  if (["cancelled", "refunded"].includes(order.data.status)) {
    return NextResponse.json({ status: "failed", authoritative: true });
  }

  const attempts = await supabase
    .from("payment_attempts")
    .select("status")
    .eq("order_id", orderId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (attempts.error) throw new Error(attempts.error.message);

  const delayed =
    ["result_unknown", "reconciliation_required"].includes(
      attempts.data?.status ?? "",
    ) || Date.now() - new Date(order.data.created_at).getTime() > 2 * 60_000;
  return NextResponse.json({
    status: delayed ? "reconciliation_delayed" : "pending_confirmation",
    authoritative: true,
  });
});

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}
