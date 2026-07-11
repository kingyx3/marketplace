#!/usr/bin/env node
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = requiredUrl("NEXT_PUBLIC_SUPABASE_URL");
const publishableKey = required("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
const siteUrl = requiredUrl("NEXT_PUBLIC_SITE_URL");
const client = createClient(supabaseUrl, publishableKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const callbackUrl = new URL("/auth/callback", siteUrl).toString();
const { data, error } = await client.auth.signInWithOAuth({
  provider: "google",
  options: {
    redirectTo: callbackUrl,
    skipBrowserRedirect: true,
    queryParams: { prompt: "select_account" },
  },
});

if (error) throw new Error(`Supabase Google OAuth initialization failed: ${error.message}`);
if (!data.url) throw new Error("Supabase Google OAuth did not return an authorization URL");

const authorizationUrl = new URL(data.url);
if (authorizationUrl.origin !== supabaseUrl.origin) {
  throw new Error(`OAuth authorization URL used unexpected origin ${authorizationUrl.origin}`);
}
if (authorizationUrl.searchParams.get("provider") !== "google") {
  throw new Error("OAuth authorization URL did not select the Google provider");
}
if (authorizationUrl.searchParams.get("redirect_to") !== callbackUrl) {
  throw new Error("OAuth authorization URL did not preserve the staging callback URL");
}

const response = await fetch(authorizationUrl, {
  redirect: "manual",
  headers: { Accept: "text/html" },
});
if (![302, 303, 307, 308].includes(response.status)) {
  throw new Error(`Supabase Google OAuth authorize endpoint returned HTTP ${response.status}`);
}
const location = response.headers.get("location");
if (!location) throw new Error("Supabase Google OAuth authorize endpoint omitted its redirect");
const googleUrl = new URL(location);
if (!googleUrl.hostname.endsWith("google.com")) {
  throw new Error(`Google OAuth redirected to unexpected host ${googleUrl.hostname}`);
}
if (!googleUrl.searchParams.get("client_id")) {
  throw new Error("Google OAuth redirect omitted client_id");
}
if (!googleUrl.searchParams.get("redirect_uri")?.includes(`${supabaseUrl.host}/auth/v1/callback`)) {
  throw new Error("Google OAuth redirect omitted the Supabase callback URL");
}

console.log(
  JSON.stringify(
    {
      provider: "google",
      stagingCallback: callbackUrl,
      authorizationOrigin: authorizationUrl.origin,
      providerHost: googleUrl.hostname,
      status: "passed",
    },
    null,
    2
  )
);

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}
function requiredUrl(name) {
  try {
    const url = new URL(required(name));
    if (url.protocol !== "https:") throw new Error();
    return url;
  } catch {
    throw new Error(`${name} must be a valid HTTPS URL`);
  }
}
