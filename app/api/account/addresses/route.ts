import { NextResponse } from "next/server";

import { requireApiCustomer } from "@/lib/api/auth";
import { withApiHandler } from "@/lib/api/handler";
import { listCustomerAddresses } from "@/lib/customer-addresses";

export const dynamic = "force-dynamic";

export const GET = withApiHandler("/api/account/addresses", async (request, context) => {
  const auth = await requireApiCustomer(request);
  context.setActor(auth.user.id);
  const addresses = await listCustomerAddresses(auth.supabase, auth.customer.id);
  return NextResponse.json(
    { addresses },
    {
      headers: {
        "Cache-Control": "private, no-store",
      },
    }
  );
});
