#!/usr/bin/env node
import { appendFile, readFile } from "node:fs/promises";
import { inspect } from "node:util";

import { applyVersionedEnvironmentConfig } from "./environment-config.mjs";
import { loadLocalDotenv } from "./generate-env.mjs";
import {
  buildHitPayWebhookConfig,
  listHitPayWebhooks,
} from "./lib/hitpay-webhook.mjs";

const PUBLIC_ENV_KEYS = Object.freeze([
  "TARGET_ENV",
  "APP_NAME",
  "GOOGLE_AUTH_ENABLED",
  "NEXT_PUBLIC_SITE_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "HITPAY_API_URL",
  "HITPAY_PAYMENT_METHODS",
  "HITPAY_WEBHOOK_ID",
  "HITPAY_WEBHOOK_ENABLED_EVENTS",
  "SUPABASE_PROJECT_REF",
  "GOOGLE_OAUTH_CLIENT_ID",
  "VERCEL_ORG_ID",
  "VERCEL_PROJECT_ID",
]);

const SENSITIVE_ENV_KEYS = Object.freeze([
  "ADMIN_EMAIL_ALLOWLIST",
  "SUPABASE_DB_PASSWORD",
  "SUPABASE_SECRET_KEY",
  "HITPAY_API_KEY",
  "HITPAY_WEBHOOK_SALT",
]);

const STRICT_KEYS = Object.freeze([
  "TARGET_ENV",
  "APP_NAME",
  "GOOGLE_AUTH_ENABLED",
  "NEXT_PUBLIC_SITE_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "HITPAY_API_URL",
  "HITPAY_PAYMENT_METHODS",
  "HITPAY_API_KEY",
  "HITPAY_WEBHOOK_SALT",
  "SUPABASE_PROJECT_REF",
  "SUPABASE_SECRET_KEY",
  "VERCEL_ORG_ID",
  "VERCEL_PROJECT_ID",
]);

export async function resolveEnvironment(env = process.env, options = {}) {
  if (options.loadDotenv !== false) await loadLocalDotenv(env);
  const targetEnv = requireTargetEnv(options.environment || env.TARGET_ENV);
  env.TARGET_ENV = targetEnv;

  const outputs = await loadTerraformOutputs(options.tfOutputJson, env);
  applyTerraformOutputs(env, outputs, targetEnv);
  await applyVersionedEnvironmentConfig(env, { targetEnv, override: false });
  applyHitPayDefaults(env, targetEnv);
  await resolveVercelValues(env);
  await resolveSupabaseValues(env);
  await resolveHitPayValues(env);

  const missing = missingRequired(env, options.requireDbPassword);
  if (options.strict && missing.length > 0) {
    throw new Error(`Could not resolve required environment value(s): ${missing.join(", ")}`);
  }
  if (options.verifySupabaseKeys) {
    await verifySupabaseProjectKeys(env);
  }
  return {
    targetEnv,
    publicValues: pickValues(env, PUBLIC_ENV_KEYS),
    sensitiveValues: pickValues(env, SENSITIVE_ENV_KEYS),
    missing,
  };
}

function applyTerraformOutputs(env, outputs, targetEnv) {
  const supabaseRefs = terraformValue(outputs, "supabase_project_refs");
  const supabaseUrls = terraformValue(outputs, "supabase_project_urls");
  const supabasePasswords = terraformValue(outputs, "supabase_database_passwords");
  const vercelProjectIds = terraformValue(outputs, "vercel_project_ids");
  const vercelProjectNames = terraformValue(outputs, "vercel_project_names");
  setIfMissing(
    env,
    "VERCEL_PROJECT_ID",
    valueForEnvironment(vercelProjectIds, targetEnv) || terraformValue(outputs, "vercel_project_id")
  );
  setIfMissing(env, "VERCEL_ORG_ID", terraformValue(outputs, "vercel_team_id"));
  setIfMissing(env, "SUPABASE_PROJECT_REF", valueForEnvironment(supabaseRefs, targetEnv));
  setIfMissing(env, "NEXT_PUBLIC_SUPABASE_URL", valueForEnvironment(supabaseUrls, targetEnv));
  setIfMissing(env, "SUPABASE_DB_PASSWORD", valueForEnvironment(supabasePasswords, targetEnv));
  if (!hasValue(env.NEXT_PUBLIC_SUPABASE_URL) && hasValue(env.SUPABASE_PROJECT_REF)) {
    env.NEXT_PUBLIC_SUPABASE_URL = `https://${env.SUPABASE_PROJECT_REF}.supabase.co`;
  }
  setIfMissing(env, "PROJECT_SLUG", terraformValue(outputs, "project_slug"));
  setIfMissing(
    env,
    "VERCEL_PROJECT_NAME",
    valueForEnvironment(vercelProjectNames, targetEnv) || terraformValue(outputs, "vercel_project_name")
  );
}

function applyHitPayDefaults(env, targetEnv) {
  setIfMissing(
    env,
    "HITPAY_API_URL",
    targetEnv === "production"
      ? "https://api.hit-pay.com"
      : "https://api.sandbox.hit-pay.com"
  );
  setIfMissing(env, "HITPAY_PAYMENT_METHODS", "paynow_online");
  setIfMissing(
    env,
    "HITPAY_WEBHOOK_ENABLED_EVENTS",
    "payment_request.completed,payment_request.failed,charge.updated"
  );
}

async function resolveVercelValues(env) {
  const token = env.VERCEL_TOKEN || env.VERCEL_API_TOKEN;
  const idOrName = env.VERCEL_PROJECT_ID || env.VERCEL_PROJECT_NAME;
  if (!token || !idOrName) return;
  const teamId = env.VERCEL_TEAM_ID || env.VERCEL_ORG_ID || "";
  const project = await fetchVercelProject(token, idOrName, teamId);
  setIfMissing(env, "VERCEL_PROJECT_ID", project.id);
  setIfMissing(
    env,
    "VERCEL_ORG_ID",
    teamId || project.accountId || (await fetchVercelUserId(token))
  );
  setIfMissing(env, "NEXT_PUBLIC_SITE_URL", inferVercelSiteUrl(project, env.TARGET_ENV));
}

async function resolveSupabaseValues(env) {
  if (!hasValue(env.SUPABASE_PROJECT_REF) && hasValue(env.NEXT_PUBLIC_SUPABASE_URL)) {
    env.SUPABASE_PROJECT_REF = projectRefFromSupabaseUrl(env.NEXT_PUBLIC_SUPABASE_URL);
  }
  if (!hasValue(env.NEXT_PUBLIC_SUPABASE_URL) && hasValue(env.SUPABASE_PROJECT_REF)) {
    env.NEXT_PUBLIC_SUPABASE_URL = `https://${env.SUPABASE_PROJECT_REF}.supabase.co`;
  }
  if (!hasValue(env.SUPABASE_ACCESS_TOKEN) || !hasValue(env.SUPABASE_PROJECT_REF)) return;

  const keys = await fetchSupabaseProjectApiKeys(
    env.SUPABASE_ACCESS_TOKEN,
    env.SUPABASE_PROJECT_REF
  );
  reconcileSupabaseProjectKey(
    env,
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    normalizedSupabaseKeys(keys).filter(isSupabasePublishableKey),
    selectSupabasePublishableKey(keys),
    env.SUPABASE_PROJECT_REF
  );
  reconcileSupabaseProjectKey(
    env,
    "SUPABASE_SECRET_KEY",
    normalizedSupabaseKeys(keys).filter(isSupabaseSecretKey),
    selectSupabaseSecretKey(keys),
    env.SUPABASE_PROJECT_REF
  );
}

async function resolveHitPayValues(env) {
  if (hasValue(env.HITPAY_WEBHOOK_ID)) return;
  if (!hasValue(env.HITPAY_API_KEY) || !hasValue(env.NEXT_PUBLIC_SITE_URL)) return;
  const config = buildHitPayWebhookConfig(env);
  let webhooks;
  try {
    webhooks = await listHitPayWebhooks(config);
  } catch (error) {
    console.log(
      `HitPay webhook id was not resolved: ${redact(error?.message || String(error), env)}`
    );
    return;
  }
  const matches = webhooks.filter((webhook) => webhook?.url === config.webhookUrl);
  if (matches.length === 1 && matches[0]?.id) {
    env.HITPAY_WEBHOOK_ID = String(matches[0].id);
  } else if (matches.length > 1) {
    console.log(
      `HitPay webhook id was not resolved: multiple registrations match ${config.webhookUrl}.`
    );
  }
}

async function fetchVercelProject(token, idOrName, teamId) {
  const url = new URL(`https://api.vercel.com/v9/projects/${encodeURIComponent(idOrName)}`);
  if (teamId && teamId.startsWith("team_")) url.searchParams.set("teamId", teamId);
  const project = await fetchJson(url, {
    headers: { Authorization: `Bearer ${token}` },
    service: "Vercel project",
  });
  if (!project || typeof project !== "object") {
    throw new Error("Vercel project response was empty.");
  }
  return project;
}

async function fetchVercelUserId(token) {
  const user = await fetchJson("https://api.vercel.com/v2/user", {
    headers: { Authorization: `Bearer ${token}` },
    service: "Vercel user",
  });
  return user?.user?.id || user?.user?.uid || user?.id || user?.uid || "";
}

async function fetchSupabaseProjectApiKeys(accessToken, projectRef) {
  const url = new URL(
    `https://api.supabase.com/v1/projects/${encodeURIComponent(projectRef)}/api-keys`
  );
  url.searchParams.set("reveal", "true");
  const keys = await fetchJson(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    service: "Supabase API keys",
  });
  if (Array.isArray(keys)) return keys;
  if (Array.isArray(keys?.api_keys)) return keys.api_keys;
  if (Array.isArray(keys?.keys)) return keys.keys;
  return [];
}

async function fetchJson(url, { headers, service }) {
  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(
      `${service} lookup failed (${response.status}): ${redact(await response.text())}`
    );
  }
  return response.json();
}

function normalizedSupabaseKeys(keys) {
  return keys
    .map((entry) => ({
      value: String(entry?.api_key || entry?.key || entry?.value || "").trim(),
      role: String(entry?.role || entry?.type || entry?.name || "").toLowerCase(),
      disabled: entry?.disabled === true,
    }))
    .filter((entry) => entry.value && !entry.disabled);
}

function isSupabasePublishableKey(entry) {
  return (
    entry.value.startsWith("sb_publishable_") ||
    entry.role.includes("publishable") ||
    entry.role === "anon"
  );
}

function isSupabaseSecretKey(entry) {
  return (
    entry.value.startsWith("sb_secret_") ||
    entry.role.includes("secret") ||
    entry.role === "service_role"
  );
}

function selectSupabasePublishableKey(keys) {
  const candidates = normalizedSupabaseKeys(keys).filter(isSupabasePublishableKey);
  return (
    candidates.find((entry) => entry.value.startsWith("sb_publishable_"))?.value ||
    candidates[0]?.value ||
    ""
  );
}

function selectSupabaseSecretKey(keys) {
  const candidates = normalizedSupabaseKeys(keys).filter(isSupabaseSecretKey);
  return (
    candidates.find((entry) => entry.value.startsWith("sb_secret_"))?.value ||
    candidates[0]?.value ||
    ""
  );
}

function reconcileSupabaseProjectKey(env, key, candidates, preferred, projectRef) {
  const current = String(env[key] || "").trim();
  if (current && candidates.some((entry) => entry.value === current)) {
    console.error(`${key} matches an active key for Supabase project ${projectRef}.`);
    return;
  }
  if (preferred) {
    env[key] = preferred;
    const action = current ? "did not match; using an active project key" : "resolved";
    console.error(`${key} ${action} for Supabase project ${projectRef}.`);
  }
}

async function verifySupabaseProjectKeys(env) {
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const projectRef = env.SUPABASE_PROJECT_REF || projectRefFromSupabaseUrl(url);
  const checks = [
    ["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY],
    ["SUPABASE_SECRET_KEY", env.SUPABASE_SECRET_KEY],
  ];
  for (const [name, key] of checks) {
    if (!hasValue(url) || !hasValue(key)) continue;
    const endpoint = new URL("/rest/v1/customers?select=id&limit=0", url);
    const response = await fetch(endpoint, {
      headers: {
        Accept: "application/json",
        apikey: key,
      },
    });
    if (response.ok) continue;
    const detail = redact(await response.text(), env);
    throw new Error(
      `${name} is not valid for Supabase project ${projectRef || "selected environment"} ` +
        `(${response.status}${detail ? `: ${detail}` : ""}). Re-run Bootstrap & Deploy so project-scoped keys are reconciled.`
    );
  }
}

async function loadTerraformOutputs(path, env) {
  const raw = path ? await readFile(path, "utf8") : env.TF_OUTPUT_JSON || "";
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`Terraform output JSON is invalid: ${error.message}`);
  }
}

function terraformValue(outputs, key) {
  const entry = outputs?.[key];
  return entry && Object.hasOwn(entry, "value") ? entry.value : entry;
}

function valueForEnvironment(value, targetEnv) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  return value[targetEnv] || "";
}

function setIfMissing(env, key, value) {
  if (hasValue(env[key]) || !hasValue(value)) return;
  env[key] = String(value).trim();
}

function hasValue(value) {
  return value !== undefined && value !== null && String(value).trim() !== "";
}

function pickValues(env, keys) {
  return Object.fromEntries(
    keys.filter((key) => hasValue(env[key])).map((key) => [key, env[key]])
  );
}

function missingRequired(env, requireDbPassword) {
  const missing = STRICT_KEYS.filter((key) => !hasValue(env[key]));
  if (env.TARGET_ENV === "production" && !hasValue(env.ADMIN_EMAIL_ALLOWLIST)) {
    missing.push("ADMIN_EMAIL_ALLOWLIST");
  }
  if (String(env.GOOGLE_AUTH_ENABLED || "true") === "true") {
    for (const key of ["GOOGLE_OAUTH_CLIENT_ID", "GOOGLE_OAUTH_CLIENT_SECRET"]) {
      if (!hasValue(env[key])) missing.push(key);
    }
  }
  if (requireDbPassword && !hasValue(env.SUPABASE_DB_PASSWORD)) {
    missing.push("SUPABASE_DB_PASSWORD");
  }
  return [...new Set(missing)];
}

function inferVercelSiteUrl(project, targetEnv) {
  const productionTarget = project?.targets?.production || {};
  const alias = firstString(productionTarget.alias || productionTarget.aliases);
  const url = firstString([
    targetEnv !== "development" ? alias : "",
    productionTarget.url,
    productionTarget.hostname,
    project?.name ? `${project.name}.vercel.app` : "",
  ]);
  return url ? ensureHttps(url) : "";
}

function firstString(value) {
  const values = Array.isArray(value) ? value : [value];
  return values.find((item) => typeof item === "string" && item.trim())?.trim() || "";
}

function ensureHttps(value) {
  return /^https?:\/\//.test(value) ? value : `https://${value}`;
}

function projectRefFromSupabaseUrl(value) {
  try {
    return new URL(value).hostname.split(".")[0] || "";
  } catch {
    return "";
  }
}

function requireTargetEnv(value) {
  if (value === "development" || value === "staging" || value === "production") {
    return value;
  }
  throw new Error("TARGET_ENV must be development, staging, or production");
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--environment") args.environment = argv[++index];
    else if (arg === "--tf-output-json") args.tfOutputJson = argv[++index];
    else if (arg === "--strict") args.strict = true;
    else if (arg === "--require-db-password") args.requireDbPassword = true;
    else if (arg === "--verify-supabase-keys") args.verifySupabaseKeys = true;
    else if (arg === "--print") args.print = true;
    else if (!arg.startsWith("--") && !args.environment) args.environment = arg;
    else throw new Error(`unknown argument: ${arg}`);
  }
  return args;
}

async function exportForGithubActions(result, env) {
  if (env.GITHUB_ENV) {
    const values = { ...result.publicValues, ...result.sensitiveValues };
    await appendFile(
      env.GITHUB_ENV,
      Object.entries(values)
        .map(([key, value]) => formatGithubLine(key, value))
        .join(""),
      "utf8"
    );
  }
  if (env.GITHUB_OUTPUT) {
    await appendFile(
      env.GITHUB_OUTPUT,
      Object.entries(result.publicValues)
        .map(([key, value]) => formatGithubLine(key.toLowerCase(), value))
        .join(""),
      "utf8"
    );
  }
  for (const value of Object.values(result.sensitiveValues)) {
    if (hasValue(value)) console.log(`::add-mask::${value}`);
  }
}

function formatGithubLine(key, value) {
  const stringValue = String(value);
  if (!stringValue.includes("\n")) return `${key}=${stringValue}\n`;
  const delimiter = `EOF_${key}_${Date.now()}`;
  return `${key}<<${delimiter}\n${stringValue}\n${delimiter}\n`;
}

function redact(value, env = process.env) {
  let redacted = String(value)
    .replaceAll(/sbp_[A-Za-z0-9_\-]+/g, "[redacted-supabase-token]")
    .replaceAll(/sb_publishable_[A-Za-z0-9_\-]+/g, "[redacted-supabase-publishable-key]")
    .replaceAll(/sb_secret_[A-Za-z0-9_\-]+/g, "[redacted-supabase-secret-key]")
    .replaceAll(/Bearer\s+[A-Za-z0-9_\-.]+/g, "Bearer [redacted]");
  for (const secret of [env.HITPAY_API_KEY, env.HITPAY_WEBHOOK_SALT]) {
    if (hasValue(secret)) redacted = redacted.replaceAll(String(secret), "[redacted-hitpay-secret]");
  }
  return redacted;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const result = await resolveEnvironment(process.env, args);
  await exportForGithubActions(result, process.env);
  if (args.print || !process.env.GITHUB_ACTIONS) {
    console.log(inspect(result.publicValues, { colors: false, depth: null }));
    if (result.missing.length > 0) {
      console.log(`missing optional/unresolved values: ${result.missing.join(", ")}`);
    }
  } else {
    console.log(
      `resolved environment values for ${result.targetEnv}: ${Object.keys(result.publicValues).join(", ")}`
    );
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(redact(error?.message || String(error)));
    process.exit(1);
  });
}
