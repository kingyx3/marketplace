import { NextResponse } from "next/server";

import { requireApiPermission } from "@/lib/api/auth";
import { toErrorResponse } from "@/lib/api/errors";

export const dynamic = "force-dynamic";

/**
 * Generic preorder lifecycle mutation is intentionally disabled.
 *
 * Allocation, payment, conversion, cancellation, and refund state changes must
 * go through their dedicated guarded workflows so inventory and payment rows
 * cannot drift from the preorder record.
 */
export async function PATCH(request: Request) {
  try {
    await requireApiPermission(request, "orders.view");
    return NextResponse.json(
      {
        error: {
          code: "PREORDER_STATE_TRANSITION_UNSUPPORTED",
          message:
            "Generic preorder status updates are disabled. Use the allocation and payment workflows.",
        },
      },
      { status: 409 }
    );
  } catch (error) {
    return toErrorResponse(error);
  }
}
