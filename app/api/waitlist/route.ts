import { NextResponse } from "next/server";

import { requireApiCustomer } from "@/lib/api/auth";
import { withApiHandler } from "@/lib/api/handler";
import { enforceRateLimit } from "@/lib/api/rate-limit";
import { readJsonBody } from "@/lib/api/request";
import { joinWaitlist, joinWaitlistRequestSchema, listCustomerWaitlist } from "@/lib/waitlist";

export const dynamic = "force-dynamic";

export const GET = withApiHandler("/api/waitlist", async (request, context) => {
  const auth = await requireApiCustomer(request);
  context.setActor(auth.user.id);
  const waitlist = await listCustomerWaitlist(auth.supabase, auth.customer.id);
  return NextResponse.json({ waitlist });
});

export const POST = withApiHandler("/api/waitlist", async (request, context) => {
  const auth = await requireApiCustomer(request);
  context.setActor(auth.user.id);
  await enforceRateLimit(auth.supabase, {
    scope: "waitlist.join",
    identifier: auth.customer.id,
    limit: 10,
    windowSeconds: 60 * 60,
    requestId: context.requestId,
  });
  const input = joinWaitlistRequestSchema.parse(
    await readJsonBody(request, { maxBytes: 8 * 1024 })
  );
  const entry = await joinWaitlist(auth.supabase, auth.customer, input);
  return NextResponse.json({ entry }, { status: 201 });
});
