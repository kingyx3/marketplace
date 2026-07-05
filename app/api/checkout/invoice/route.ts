import { NextResponse } from "next/server";
import { requireApiCustomer } from "@/lib/api/auth";
import { toErrorResponse } from "@/lib/api/errors";
import { readJsonBody } from "@/lib/api/request";
import { createInvoiceCheckout, invoiceCheckoutResponseBody } from "@/lib/checkout";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const auth = await requireApiCustomer(request);
    const result = await createInvoiceCheckout(auth, await readJsonBody(request));
    return NextResponse.json(invoiceCheckoutResponseBody(result), { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
