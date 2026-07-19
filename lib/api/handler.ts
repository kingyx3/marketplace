import { NextResponse } from "next/server";

import { requestTimeout, toErrorResponse } from "@/lib/api/errors";
import {
  logInfo,
  requestIdFrom,
  withRequestId,
  type LogContext,
} from "@/lib/observability";

export interface ApiHandlerContext extends LogContext {
  requestId: string;
  route: string;
  method: string;
  setActor(userId: string | null): void;
}

export interface ApiHandlerOptions {
  timeoutMs?: number;
}

export type ApiHandler = (
  request: Request,
  context: ApiHandlerContext
) => Promise<Response | NextResponse>;

export function withApiHandler(
  route: string,
  handler: ApiHandler,
  options: ApiHandlerOptions = {}
): (request: Request) => Promise<NextResponse> {
  return async function apiHandler(request: Request): Promise<NextResponse> {
    const startedAt = performance.now();
    const requestId = requestIdFrom(request);
    const context: ApiHandlerContext = {
      requestId,
      route,
      method: request.method,
      setActor(userId) {
        context.userId = userId ?? undefined;
      },
    };

    try {
      const response = await withTimeout(
        handler(request, context),
        options.timeoutMs ?? 20_000
      );
      const normalized = normalizeResponse(response);
      withRequestId(normalized, requestId);
      normalized.headers.set("Cache-Control", normalized.headers.get("Cache-Control") ?? "no-store");
      normalized.headers.set("X-Content-Type-Options", "nosniff");

      logInfo("api.request.completed", {
        ...context,
        status: normalized.status,
        durationMs: Math.round(performance.now() - startedAt),
      });
      return normalized;
    } catch (error) {
      return toErrorResponse(error, {
        ...context,
        durationMs: Math.round(performance.now() - startedAt),
      });
    }
  };
}

function normalizeResponse(response: Response | NextResponse): NextResponse {
  if (response instanceof NextResponse) return response;
  return new NextResponse(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(requestTimeout()), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
