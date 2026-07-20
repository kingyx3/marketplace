import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { reportOperationalFailure } from "@/lib/operational-alerts";
import { logError, logInfo, logWarn, requestIdFrom, withRequestId } from "@/lib/observability";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const requestId = requestIdFrom(request);
  const startedAt = Date.now();
  const context = { requestId, route: "/api/cron/invoice-expiry", method: "GET" };
  const respond = (body: unknown, status = 200) =>
    withRequestId(NextResponse.json(body, { status }), requestId);

  const secret = process.env.CRON_SECRET;
  if (!secret) {
    const error = new Error("missing cron secret");
    logError("cron.invoice_expiry.not_configured", error, {
      ...context,
      status: 503,
    });
    await reportOperationalFailure(
      {
        event: "cron.invoice_expiry.not_configured",
        severity: "critical",
        summary: "Invoice allocation expiry cron is not configured",
        context: { ...context, status: 503 },
      },
      error
    );
    return respond(
      { error: { code: "CRON_NOT_CONFIGURED", message: "Cron authentication is not configured" } },
      503
    );
  }

  if (!authorized(request.headers.get("authorization"), secret)) {
    logWarn("cron.invoice_expiry.unauthorized", { ...context, status: 401 });
    return respond({ error: { code: "UNAUTHORIZED", message: "Unauthorized" } }, 401);
  }

  const { data, error } = await createServiceClient().rpc("expire_stale_invoice_orders", {
    p_limit: 500,
  });

  if (error) {
    logError("cron.invoice_expiry.failed", error, {
      ...context,
      status: 500,
      durationMs: Date.now() - startedAt,
    });
    await reportOperationalFailure(
      {
        event: "cron.invoice_expiry.failed",
        severity: "critical",
        summary: "Invoice expiry cron failed and stale inventory may remain allocated",
        context: {
          ...context,
          status: 500,
          durationMs: Date.now() - startedAt,
        },
      },
      error
    );
    return respond(
      { error: { code: "INVOICE_EXPIRY_FAILED", message: "Invoice expiry failed" } },
      500
    );
  }

  const expiredOrders = Number(data ?? 0);
  logInfo("cron.invoice_expiry.completed", {
    ...context,
    status: 200,
    expiredOrders,
    durationMs: Date.now() - startedAt,
  });
  return respond({ expiredOrders });
}

function authorized(header: string | null, secret: string): boolean {
  const expected = Buffer.from(`Bearer ${secret}`);
  const received = Buffer.from(header ?? "");
  return received.length === expected.length && timingSafeEqual(received, expected);
}
