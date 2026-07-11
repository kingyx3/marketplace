import { redirect } from "next/navigation";
import { NextResponse } from "next/server";

import { getRequestOrigin } from "@/lib/request-origin";
import { createUserClient } from "@/lib/supabase";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const origin = getRequestOrigin(request);
  const next = sanitizeNextPath(requestUrl.searchParams.get("next"));
  let supabase;
  try {
    supabase = await createUserClient();
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Supabase is not configured")) {
      return NextResponse.redirect(`${origin}/auth/auth-code-error`);
    }
    throw error;
  }

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`,
      queryParams: {
        access_type: "offline",
        prompt: "consent select_account",
      },
    },
  });

  if (error || !data.url) {
    return NextResponse.redirect(`${origin}/auth/auth-code-error`);
  }

  redirect(data.url);
}

function sanitizeNextPath(next: string | null): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) {
    return "/account";
  }
  return next;
}
