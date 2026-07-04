import { NextResponse } from "next/server";
import { getAccountProfile, updateAccountProfile } from "@/lib/accounts";
import { toErrorResponse } from "@/lib/api/errors";
import { requireApiCustomer } from "@/lib/api/auth";
import { readJsonBody } from "@/lib/api/request";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const auth = await requireApiCustomer(request);
    const profile = await getAccountProfile(auth.supabase, auth.customer);
    return NextResponse.json(profile);
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await requireApiCustomer(request);
    const customer = await updateAccountProfile(
      auth.supabase,
      auth.customer,
      await readJsonBody(request)
    );
    return NextResponse.json({ customer });
  } catch (error) {
    return toErrorResponse(error);
  }
}
