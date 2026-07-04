import { NextResponse } from "next/server";
import { toErrorResponse } from "@/lib/api/errors";
import { requireApiCustomer } from "@/lib/api/auth";
import { clearCart } from "@/lib/cart";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    await requireApiCustomer(request);
    await clearCart();
    return NextResponse.json({ cleared: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
