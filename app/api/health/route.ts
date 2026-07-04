import { NextResponse } from "next/server";
import { collectReadiness, shallowHealth } from "@/lib/readiness";

export const dynamic = "force-dynamic";

/**
 * Health/readiness endpoint used by the post-deploy smoke test
 * (.github/workflows/deploy.yml). Plain /api/health intentionally does
 * not hit dependencies; /api/health?deep=1 performs readiness checks.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  if (url.searchParams.get("deep") === "1") {
    const readiness = await collectReadiness();
    return NextResponse.json(readiness, { status: readiness.status === "ok" ? 200 : 503 });
  }

  return NextResponse.json(shallowHealth());
}
