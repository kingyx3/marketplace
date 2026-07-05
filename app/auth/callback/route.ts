import { NextResponse } from "next/server";

import { appendWelcomeParam, isFreshSignup } from "@/lib/signup-welcome";
import { createUserClient } from "@/lib/supabase";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = sanitizeNextPath(searchParams.get("next"));

  if (code) {
    const supabase = await createUserClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const redirectPath = user && isFreshSignup(user) ? appendWelcomeParam(next) : next;
      const forwardedHost = request.headers.get("x-forwarded-host");
      const isLocal = process.env.NODE_ENV === "development";
      if (!isLocal && forwardedHost) {
        return NextResponse.redirect(`https://${forwardedHost}${redirectPath}`);
      }
      return NextResponse.redirect(`${origin}${redirectPath}`);
    }
  }

  return NextResponse.redirect(`${origin}/auth/auth-code-error`);
}

function sanitizeNextPath(next: string | null): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) {
    return "/account";
  }
  return next;
}
