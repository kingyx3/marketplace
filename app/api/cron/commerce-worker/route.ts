import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

import { withApiHandler } from "@/lib/api/handler";
import { unauthorized } from "@/lib/api/errors";
import { runCommerceWorker } from "@/lib/commerce-worker";
import { createSecretClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const GET = withApiHandler(
  "/api/cron/commerce-worker",
  async (request) => {
    const secret = process.env.CRON_SECRET?.trim();
    if (!secret || !authorized(request.headers.get("authorization"), secret)) {
      throw unauthorized();
    }

    const result = await runCommerceWorker(createSecretClient(), {
      batchSize: 25,
    });
    return NextResponse.json(result);
  },
  { timeoutMs: 55_000 },
);

function authorized(header: string | null, secret: string): boolean {
  const expected = Buffer.from(`Bearer ${secret}`);
  const received = Buffer.from(header ?? "");
  return (
    received.length === expected.length && timingSafeEqual(received, expected)
  );
}
