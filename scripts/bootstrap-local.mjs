#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { chmod, readFile, writeFile } from "node:fs/promises";

import { applyVersionedEnvironmentConfig } from "./environment-config.mjs";
import { parseDotenv, renderDotenv, validateEnv } from "./generate-env.mjs";
import { pinnedNpxPackage, TOOL_VERSIONS } from "./tool-versions.mjs";

const args = new Set(process.argv.slice(2));
const checkOnly = args.has("--check-only");
const skipInstall = args.has("--skip-install");
const skipReset = args.has("--skip-reset");

checkPrerequisite("Node", process.execPath, ["--version"], (value) =>
  value.startsWith(`v${TOOL_VERSIONS.node.split(".")[0]}.`)
);
checkPrerequisite("npm", "npm", ["--version"], () => true);
checkPrerequisite("Docker", "docker", ["info"], () => true, { quiet: true });
if (checkOnly) {
  console.log("Local bootstrap prerequisites are available.");
  process.exit(0);
}

if (!skipInstall) run("npm", ["ci"]);
run("npx", ["--yes", pinnedNpxPackage("supabase"), "start"]);
const status = run("npx", ["--yes", pinnedNpxPackage("supabase"), "status", "--output", "env"], {
  capture: true,
});
const supabase = parseShellEnv(status.stdout);
const envPath = ".env.local";
const current = await readOptionalDotenv(envPath);
const merged = { ...current };
await applyVersionedEnvironmentConfig(merged, {
  targetEnv: "development",
  override: false,
});

setIfPresent(merged, "NEXT_PUBLIC_SUPABASE_URL", supabase.API_URL || supabase.SUPABASE_URL);
setIfPresent(
  merged,
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  supabase.ANON_KEY || supabase.PUBLISHABLE_KEY
);
setIfPresent(merged, "SUPABASE_SECRET_KEY", supabase.SERVICE_ROLE_KEY || supabase.SECRET_KEY);
merged.APP_NAME ||= "Marketplace";
merged.NEXT_PUBLIC_SITE_URL ||= "http://localhost:3000";
merged.HITPAY_API_URL ||= "https://api.sandbox.hit-pay.com";
merged.HITPAY_PAYMENT_METHODS ||= "paynow_online";
for (const key of ["HITPAY_API_KEY", "HITPAY_WEBHOOK_SALT"]) {
  if (!merged[key] && process.env[key]) merged[key] = process.env[key];
}

await writeFile(envPath, renderDotenv(merged), { encoding: "utf8", mode: 0o600 });
await chmod(envPath, 0o600);
console.log(
  `Wrote ${envPath} from local Supabase state while preserving existing provider values.`
);
if (!skipReset) run("npx", ["--yes", pinnedNpxPackage("supabase"), "db", "reset"]);

const validation = validateEnv({
  ...merged,
  TARGET_ENV: "development",
  GOOGLE_AUTH_ENABLED: "false",
});
if (validation.ok) {
  console.log("Local runtime environment is complete. Run npm run dev.");
} else {
  console.log(
    "Local Supabase and database bootstrap completed. Runtime provider values still required:"
  );
  for (const error of validation.errors) console.log(`  - ${error}`);
  console.log(
    "Add HitPay sandbox API key and webhook salt values to .env.local, then run npm run env:check."
  );
}

function parseShellEnv(content) {
  const values = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim().replace(/^export\s+/, "");
    const equals = line.indexOf("=");
    if (equals <= 0) continue;
    const key = line.slice(0, equals).trim();
    let value = line.slice(equals + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

async function readOptionalDotenv(path) {
  try {
    return parseDotenv(await readFile(path, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return {};
    throw error;
  }
}

function setIfPresent(target, key, value) {
  if (value) target[key] = value;
}

function checkPrerequisite(name, command, commandArgs, validate, options = {}) {
  const result = spawnSync(command, commandArgs, {
    encoding: "utf8",
    stdio: options.quiet ? ["ignore", "pipe", "pipe"] : ["ignore", "pipe", "pipe"],
  });
  if (result.error || result.status !== 0) {
    fail(`${name} is unavailable. Install/configure it before bootstrapping.`);
  }
  const output = `${result.stdout || ""}${result.stderr || ""}`.trim();
  if (!validate(output)) fail(`${name} version is unsupported: ${output}`);
  console.log(`${name}: ${output.split(/\r?\n/)[0] || "available"}`);
}

function run(command, commandArgs, options = {}) {
  console.log(`\n$ ${[command, ...commandArgs].join(" ")}`);
  const result = spawnSync(command, commandArgs, {
    env: process.env,
    encoding: options.capture ? "utf8" : undefined,
    stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit",
  });
  if (result.error) fail(`${command} failed to start: ${result.error.message}`);
  if (result.status !== 0) {
    fail(
      `${command} failed with exit code ${result.status}${result.stderr ? `\n${result.stderr}` : ""}`
    );
  }
  return result;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
