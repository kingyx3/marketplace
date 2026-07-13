#!/usr/bin/env node
import { inspect } from "node:util";

import { resolveVercelPreviewRedirectPattern } from "./lib/vercel-preview-auth.mjs";

const args = new Set(process.argv.slice(2));
const mode = args.has("--apply")
  ? "apply"
  : args.has("--apply-if-configured")
    ? "apply-if-configured"
    : args.has("--verify")
      ? "verify"
      : "plan";
const previewRedirectPattern = await resolveVercelPreviewRedirectPattern(process.env);
const config = buildConfig(process.env, previewRedirectPattern);

try {
  if (mode === "plan") {
    await printPlan(config);
  } else if (mode === "verify") {
    await verifyHostedProvider(config, { strict: true });
  } else {
    await applyHostedProvider(config, { skipWhenMissing: mode === "apply-if-configured" });
    await verifyHostedProvider(config, { strict: false });
  }
} catch (error) {
  console.error(redact(error?.message || String(error)));
  process.exit(1);
}

function buildConfig(env, previewRedirectPattern = "") {
  const siteUrl = normalizeOrigin(env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000");
  const supabaseUrl = normalizeOrigin(env.NEXT_PUBLIC_SUPABASE_URL || "");
  const projectRef = env.SUPABASE_PROJECT_REF || projectRefFromUrl(supabaseUrl);
  const enabled = String(env.GOOGLE_AUTH_ENABLED ?? "true") === "true";
  const redirectAllowList = unique([
    `${siteUrl}/auth/callback`,
    `${siteUrl}/auth/callback**`,
    previewRedirectPattern,
    "http://localhost:3000/auth/callback",
    "http://localhost:3000/auth/callback**",
  ]);
  return {
    enabled,
    siteUrl,
    supabaseUrl,
    projectRef,
    publishableKey: env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "",
    accessToken: env.SUPABASE_ACCESS_TOKEN || "",
    googleClientId: env.GOOGLE_OAUTH_CLIENT_ID || "",
    googleClientSecret: env.GOOGLE_OAUTH_CLIENT_SECRET || "",
    redirectAllowList,
  };
}

async function printPlan(config) {
  const current = config.accessToken && config.projectRef ? await fetchHostedAuthConfig(config) : null;
  const desired = desiredAuthConfig(config);
  console.log(inspect({
    googleCloudManualBoundary: config.enabled ? {
      applicationType: "Web application",
      authorizedJavaScriptOrigins: unique([config.siteUrl, "http://localhost:3000"]),
      authorizedRedirectUris: unique([
        config.supabaseUrl ? `${config.supabaseUrl}/auth/v1/callback` : "https://<project-ref>.supabase.co/auth/v1/callback",
        "http://127.0.0.1:54321/auth/v1/callback",
      ]),
    } : { disabled: true },
    supabaseHostedProject: {
      desired: sanitizeDesired(desired),
      changes: current ? diffAuthConfig(current, desired) : "Management credentials unavailable; desired state only",
    },
  }, { colors: false, depth: null }));
}

async function applyHostedProvider(config, { skipWhenMissing }) {
  const missing = requiredForApply(config);
  if (missing.length > 0) {
    const message = `Google OAuth provider was not applied. Missing: ${missing.join(", ")}`;
    if (skipWhenMissing) {
      console.log(message);
      await printPlan(config);
      return;
    }
    throw new Error(message);
  }

  const current = await fetchHostedAuthConfig(config);
  const patch = diffAuthConfig(current, desiredAuthConfig(config));
  if (Object.keys(patch).length === 0) {
    console.log(`Supabase hosted auth configuration is already converged for ${config.projectRef}.`);
    return;
  }

  const response = await fetch(`https://api.supabase.com/v1/projects/${encodeURIComponent(config.projectRef)}/config/auth`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${config.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(patch),
  });
  if (!response.ok) throw new Error(`Supabase Auth configuration update failed (${response.status}): ${redact(await response.text())}`);
  console.log(`Supabase hosted auth configuration updated: ${Object.keys(patch).join(", ")}`);
}

async function verifyHostedProvider(config, { strict }) {
  if (config.accessToken && config.projectRef) {
    const current = await fetchHostedAuthConfig(config);
    const patch = diffAuthConfig(current, desiredAuthConfig(config));
    if (Object.keys(patch).length > 0) {
      const message = `Supabase hosted auth configuration differs: ${Object.keys(patch).join(", ")}`;
      if (strict) throw new Error(message);
      console.log(message);
      return;
    }
    console.log(`Supabase hosted auth configuration verified for ${config.projectRef}.`);
    return;
  }

  if (!config.supabaseUrl || !config.publishableKey) {
    const message = "Cannot verify Google OAuth provider without Management API credentials or public Supabase settings.";
    if (strict) throw new Error(message);
    console.log(message);
    return;
  }
  const response = await fetch(`${config.supabaseUrl}/auth/v1/settings`, { headers: { apikey: config.publishableKey } });
  if (!response.ok) {
    const message = `Cannot verify Supabase Auth settings (${response.status}).`;
    if (strict) throw new Error(message);
    console.log(message);
    return;
  }
  const settings = await response.json();
  const enabled = Boolean(settings?.external?.google);
  if (enabled !== config.enabled && strict) throw new Error(`Supabase external.google=${enabled}; expected ${config.enabled}.`);
  console.log(`Supabase Auth Google provider reported by /auth/v1/settings: ${enabled ? "enabled" : "disabled"}`);
}

async function fetchHostedAuthConfig(config) {
  const response = await fetch(`https://api.supabase.com/v1/projects/${encodeURIComponent(config.projectRef)}/config/auth`, {
    headers: { Authorization: `Bearer ${config.accessToken}` },
  });
  if (!response.ok) throw new Error(`Supabase Auth configuration lookup failed (${response.status}): ${redact(await response.text())}`);
  return response.json();
}

function desiredAuthConfig(config) {
  return {
    external_google_enabled: config.enabled,
    ...(config.enabled ? {
      external_google_client_id: config.googleClientId,
      external_google_secret: config.googleClientSecret,
    } : {}),
    site_url: config.siteUrl,
    uri_allow_list: config.redirectAllowList.join(","),
  };
}

function diffAuthConfig(current, desired) {
  const patch = {};
  for (const [key, desiredValue] of Object.entries(desired)) {
    if (key === "external_google_secret") {
      const clientChanged = current?.external_google_client_id !== desired.external_google_client_id;
      const enabling = !current?.external_google_enabled && desired.external_google_enabled;
      const missing = current?.external_google_secret === "" || current?.external_google_secret === null;
      if (clientChanged || enabling || missing) patch[key] = desiredValue;
      continue;
    }
    const currentValue = key === "uri_allow_list" ? normalizeAllowList(current?.[key]) : current?.[key];
    const normalizedDesired = key === "uri_allow_list" ? normalizeAllowList(desiredValue) : desiredValue;
    if (currentValue !== normalizedDesired) patch[key] = desiredValue;
  }
  return patch;
}

function normalizeAllowList(value) {
  const list = Array.isArray(value) ? value : String(value || "").split(",");
  return [...new Set(list.map((item) => item.trim()).filter(Boolean))].sort().join(",");
}

function requiredForApply(config) {
  return [
    ["SUPABASE_ACCESS_TOKEN", config.accessToken],
    ["SUPABASE_PROJECT_REF", config.projectRef],
    ...(config.enabled ? [
      ["GOOGLE_OAUTH_CLIENT_ID", config.googleClientId],
      ["GOOGLE_OAUTH_CLIENT_SECRET", config.googleClientSecret],
    ] : []),
  ].filter(([, value]) => !value).map(([key]) => key);
}

function sanitizeDesired(desired) {
  return { ...desired, ...(desired.external_google_secret ? { external_google_secret: "[configured]" } : {}) };
}
function projectRefFromUrl(url) {
  if (!url) return "";
  try { return new URL(url).hostname.split(".")[0] || ""; } catch { return ""; }
}
function normalizeOrigin(value) {
  if (!value) return "";
  try { return new URL(value).origin; } catch { return ""; }
}
function unique(values) { return [...new Set(values.filter(Boolean))]; }
function redact(value) {
  return String(value)
    .replaceAll(/sbp_[A-Za-z0-9_\-]+/g, "[redacted]")
    .replaceAll(/GOCSPX-[A-Za-z0-9_\-]+/g, "[redacted]")
    .replaceAll(/[0-9]+-[A-Za-z0-9_\-]+\.apps\.googleusercontent\.com/g, "[redacted-google-client-id]");
}
