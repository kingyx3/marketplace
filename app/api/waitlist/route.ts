import { NextResponse } from "next/server";
import { requireApiCustomer } from "@/lib/api/auth";
import { toErrorResponse } from "@/lib/api/errors";
import { readJsonBody } from "@/lib/api/request";
import { joinWaitlist, joinWaitlistRequestSchema, listCustomerWaitlist } from "@/lib/waitlist";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const auth = await requireApiCustomer(request);
    const waitlist = await listCustomerWaitlist(auth.supabase, auth.customer.id);
    return NextResponse.json({ waitlist });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireApiCustomer(request);
    const input = joinWaitlistRequestSchema.parse(await readJsonBody(request));
    const entry = await joinWaitlist(auth.supabase, auth.customer, input);
    return NextResponse.json({ entry }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
