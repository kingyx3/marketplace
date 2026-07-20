import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

import { hasSupabasePublicEnv } from "@/lib/env";

const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;

export async function proxy(request: NextRequest) {
  const requestId = validRequestId(request.headers.get("x-request-id")) ?? crypto.randomUUID();
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-request-id", requestId);

  const createResponse = () => {
    const next = NextResponse.next({
      request: { headers: requestHeaders },
    });
    next.headers.set("x-request-id", requestId);
    return next;
  };

  let response = createResponse();

  if (!hasSupabasePublicEnv()) {
    return response;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    return response;
  }

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = createResponse();
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
        Object.entries(headers).forEach(([name, value]) => {
          response.headers.set(name, value);
        });
      },
    },
  });

  await supabase.auth.getClaims();
  return response;
}

function validRequestId(value: string | null): string | null {
  const candidate = value?.trim();
  return candidate && REQUEST_ID_PATTERN.test(candidate) ? candidate : null;
}

export const config = {
  matcher: [
    "/((?!api/webhooks/hitpay|monitoring|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
