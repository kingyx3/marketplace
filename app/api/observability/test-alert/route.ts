import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { sendOperationalAlert } from "@/lib/operational-alerts";
import { logInfo, requestIdFrom, withRequestId } from "@/lib/observability";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const requestId = requestIdFrom(request);
  const respond = (body: unknown, status = 200) =>
    withRequestId(NextResponse.json(body, { status }), requestId);
  const secret = process.env.SYNTHETIC_MONITOR_SECRET;

  if (!secret) {
    return respond(
      { error: { code: "SYNTHETIC_MONITOR_NOT_CONFIGURED", message: "Monitor is not configured" } },
      503
    );
  }
  if (!authorized(request.headers.get("authorization"), secret)) {
    return respond({ error: { code: "UNAUTHORIZED", message: "Unauthorized" } }, 401);
  }

  await sendOperationalAlert({
    event: "synthetic.release_gate.alert",
    severity: "warning",
    summary: "Marketplace release-gate alert delivery test",
    context: {
      requestId,
      route: "/api/observability/test-alert",
      method: "POST",
      synthetic: true,
    },
  });
  logInfo("synthetic.release_gate.alert_completed", {
    requestId,
    route: "/api/observability/test-alert",
    method: "POST",
    status: 200,
  });
  return respond({ delivered: true, requestId });
}

function authorized(header: string | null, secret: string): boolean {
  const expected = Buffer.from(`Bearer ${secret}`);
  const received = Buffer.from(header ?? "");
  return received.length === expected.length && timingSafeEqual(received, expected);
}
