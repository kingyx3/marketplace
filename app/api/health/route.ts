import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Health/readiness endpoint used by the post-deploy smoke test
 * (.github/workflows/deploy.yml). Intentionally does NOT hit the
 * database: it answers "is the app process serving traffic". A deeper
 * dependency check can be added at /api/health?deep=1 later.
 */
export async function GET() {
  return NextResponse.json({
    status: "ok",
    service: "marketplace",
    timestamp: new Date().toISOString(),
  });
}
