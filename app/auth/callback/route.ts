import { NextResponse } from "next/server";

import { getRequestOrigin } from "@/lib/request-origin";
import { appendWelcomeParam, isFreshSignup } from "@/lib/signup-welcome";
import { createUserClient } from "@/lib/supabase";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const origin = getRequestOrigin(request);
  const code = searchParams.get("code");
  const next = sanitizeNextPath(searchParams.get("next"));

  if (code) {
    let supabase;
    try {
      supabase = await createUserClient();
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("Supabase is not configured")) {
        return NextResponse.redirect(authCodeErrorUrl(origin, next));
      }
      throw error;
    }

    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const redirectPath = user && isFreshSignup(user) ? appendWelcomeParam(next) : next;
      return NextResponse.redirect(`${origin}${redirectPath}`);
    }
  }

  return NextResponse.redirect(authCodeErrorUrl(origin, next));
}

function authCodeErrorUrl(origin: string, next: string): string {
  const url = new URL("/auth/auth-code-error", origin);
  url.searchParams.set("next", next);
  return url.toString();
}

function sanitizeNextPath(next: string | null): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) {
    return "/account";
  }
  return next;
}
