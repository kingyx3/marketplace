import { NextResponse } from "next/server";
import { getAccountProfile, upsertB2bApplication } from "@/lib/accounts";
import { toErrorResponse } from "@/lib/api/errors";
import { requireApiCustomer } from "@/lib/api/auth";
import { readJsonBody } from "@/lib/api/request";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const auth = await requireApiCustomer(request);
    const profile = await getAccountProfile(auth.supabase, auth.customer);
    return NextResponse.json({ b2bAccount: profile.b2bAccount });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function PUT(request: Request) {
  try {
    const auth = await requireApiCustomer(request);
    const b2bAccount = await upsertB2bApplication(
      auth.supabase,
      auth.customer,
      await readJsonBody(request)
    );
    return NextResponse.json({ b2bAccount }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
