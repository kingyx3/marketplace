#!/usr/bin/env node
import { inspect } from "node:util";

const args = new Set(process.argv.slice(2));
const mode = args.has("--apply")
  ? "apply"
  : args.has("--apply-if-configured")
    ? "apply-if-configured"
    : args.has("--verify")
      ? "verify"
      : "plan";

const config = buildConfig(process.env);

if (mode === "plan") {
  printPlan(config);
} else if (mode === "verify") {
  await verifyHostedProvider(config, { strict: true });
} else {
  await applyHostedProvider(config, { skipWhenMissing: mode === "apply-if-configured" });
  await verifyHostedProvider(config, { strict: false });
}

function buildConfig(env) {
  const siteUrl = normalizeOrigin(env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000");
  const supabaseUrl = normalizeOrigin(env.NEXT_PUBLIC_SUPABASE_URL || "");
  const projectRef = env.SUPABASE_PROJECT_REF || projectRefFromUrl(supabaseUrl);
  return {
    siteUrl,
    supabaseUrl,
    projectRef,
    publishableKey: env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "",
    accessToken: env.SUPABASE_ACCESS_TOKEN || "",
    googleClientId:
      env.GOOGLE_OAUTH_CLIENT_ID ||
      env.SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID ||
      env.SUPABASE_AUTH_GOOGLE_CLIENT_ID ||
      "",
    googleClientSecret:
      env.GOOGLE_OAUTH_CLIENT_SECRET ||
      env.SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_SECRET ||
      env.SUPABASE_AUTH_GOOGLE_CLIENT_SECRET ||
      "",
  };
}

function printPlan(config) {
  const appOrigin = config.siteUrl || "https://your-app.example.com";
  const hostedSupabaseCallback = config.supabaseUrl
    ? `${config.supabaseUrl}/auth/v1/callback`
    : "https://<project-ref>.supabase.co/auth/v1/callback";

  const plan = {
    googleCloud: {
      applicationType: "Web application",
      authorizedJavaScriptOrigins: unique([
        appOrigin,
        "http://localhost:3000",
      ]),
      authorizedRedirectUris: unique([
        hostedSupabaseCallback,
        "http://127.0.0.1:54321/auth/v1/callback",
      ]),
    },
    supabaseHostedProject: {
      provider: "Google",
      enabled: true,
      clientIdEnv: "GOOGLE_OAUTH_CLIENT_ID",
      clientSecretEnv: "GOOGLE_OAUTH_CLIENT_SECRET",
      siteUrl: appOrigin,
      redirectAllowList: unique([
        `${appOrigin}/auth/callback`,
        `${appOrigin}/auth/callback**`,
        "http://localhost:3000/auth/callback",
        "http://localhost:3000/auth/callback**",
      ]),
      canApplyProviderWithThisScript: Boolean(
        config.accessToken && config.projectRef && config.googleClientId && config.googleClientSecret
      ),
    },
    localSupabase: {
      env: {
        SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID: "<Google web client id>",
        SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_SECRET: "<Google web client secret>",
      },
      callbackUrl: "http://127.0.0.1:54321/auth/v1/callback",
    },
  };

  console.log(inspect(plan, { colors: false, depth: null }));
}

async function applyHostedProvider(config, { skipWhenMissing }) {
  const missing = requiredForApply(config);
  if (missing.length > 0) {
    const message = `Google OAuth provider was not applied. Missing: ${missing.join(", ")}`;
    if (skipWhenMissing) {
      console.log(message);
      printPlan(config);
      return;
    }
    throw new Error(message);
  }

  const response = await fetch(
    `https://api.supabase.com/v1/projects/${encodeURIComponent(config.projectRef)}/config/auth`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${config.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        external_google_enabled: true,
        external_google_client_id: config.googleClientId,
        external_google_secret: config.googleClientSecret,
      }),
    }
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Supabase Auth Google provider update failed (${response.status}): ${redact(body)}`
    );
  }

  console.log("Supabase Auth Google provider is enabled for this project.");
}

async function verifyHostedProvider(config, { strict }) {
  if (!config.supabaseUrl || !config.publishableKey) {
    const message = "Cannot verify Google OAuth provider without NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.";
    if (strict) throw new Error(message);
    console.log(message);
    return;
  }

  const response = await fetch(`${config.supabaseUrl}/auth/v1/settings`, {
    headers: { apikey: config.publishableKey },
  });
  if (!response.ok) {
    const message = `Cannot verify Supabase Auth settings (${response.status}).`;
    if (strict) throw new Error(message);
    console.log(message);
    return;
  }

  const settings = await response.json();
  const enabled = Boolean(settings?.external?.google);
  if (!enabled && strict) {
    throw new Error("Supabase Auth settings report external.google=false. Configure the Google provider and redirect URLs.");
  }
  console.log(`Supabase Auth Google provider reported by /auth/v1/settings: ${enabled ? "enabled" : "disabled"}`);
}

function requiredForApply(config) {
  return [
    ["SUPABASE_ACCESS_TOKEN", config.accessToken],
    ["SUPABASE_PROJECT_REF", config.projectRef],
    ["GOOGLE_OAUTH_CLIENT_ID", config.googleClientId],
    ["GOOGLE_OAUTH_CLIENT_SECRET", config.googleClientSecret],
  ]
    .filter(([, value]) => !value)
    .map(([key]) => key);
}

function projectRefFromUrl(url) {
  if (!url) return "";
  try {
    return new URL(url).hostname.split(".")[0] || "";
  } catch {
    return "";
  }
}

function normalizeOrigin(value) {
  if (!value) return "";
  try {
    return new URL(value).origin;
  } catch {
    return "";
  }
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function redact(value) {
  return value
    .replaceAll(/sbp_[A-Za-z0-9_\-]+/g, "[redacted]")
    .replaceAll(/GOCSPX-[A-Za-z0-9_\-]+/g, "[redacted]")
    .replaceAll(/[0-9]+-[A-Za-z0-9_\-]+\.apps\.googleusercontent\.com/g, "[redacted-google-client-id]");
}
