import { NextResponse } from "next/server";

import { requireApiPermission } from "@/lib/api/auth";
import { badRequest, notFound, serviceUnavailable, toErrorResponse } from "@/lib/api/errors";
import { enforceRateLimit } from "@/lib/api/rate-limit";
import {
  fetchTcgplayerCatalogSuggestion,
  TcgplayerCatalogError,
} from "@/lib/tcgplayer-catalog";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const auth = await requireApiPermission(request, "catalog.manage");
    await enforceRateLimit(auth.supabase, {
      scope: "admin.tcgplayer_catalog_lookup",
      identifier: auth.user.id,
      limit: 30,
      windowSeconds: 60,
    });
    const reference = new URL(request.url).searchParams.get("product")?.trim() ?? "";
    if (reference.length === 0 || reference.length > 300) {
      throw badRequest("Enter a TCGplayer product URL or numeric product ID.");
    }

    const suggestion = await fetchTcgplayerCatalogSuggestion(reference);
    const response = NextResponse.json(suggestion);
    response.headers.set("Cache-Control", "private, no-store");
    response.headers.set("X-Content-Type-Options", "nosniff");
    return response;
  } catch (error) {
    const mappedError = mapTcgplayerError(error);
    return toErrorResponse(mappedError, {
      route: "/api/control/tcgplayer-catalog",
      operation: "lookup",
    });
  }
}

function mapTcgplayerError(error: unknown): unknown {
  if (!(error instanceof TcgplayerCatalogError)) return error;
  if (error.kind === "invalid_reference") return badRequest(error.message);
  if (error.kind === "not_found") return notFound(error.message);
  return serviceUnavailable(error.message);
}
