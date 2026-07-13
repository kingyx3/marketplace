#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { readFile, rm } from "node:fs/promises";
import { applyVersionedEnvironmentConfig } from "./environment-config.mjs";
import { loadLocalDotenv, parseDotenv } from "./generate-env.mjs";
import { withoutEmptyEnvironmentValues } from "./lib/process-environment.mjs";
import {
  genericVercelEnvironmentRecords,
  isUnreadableVercelEnvironmentRecord,
  parseVercelEnvironmentList,
} from "./lib/vercel-environment.mjs";
import { pinnedNpxPackage } from "./tool-versions.mjs";

await loadLocalDotenv(process.env);
await applyVersionedEnvironmentConfig(process.env);

const providerMode = argumentValue("--providers") || "apply-if-configured";
if (!["skip", "plan", "apply", "apply-if-configured", "verify"].includes(providerMode)) {
  fail(`Unsupported --providers mode: ${providerMode}`);
}
if (!/^(development|staging|production)$/.test(process.env.TARGET_ENV || "")) {
  fail("TARGET_ENV must be development, staging, or production");
}
if (!process.env.VERCEL_TOKEN) fail("VERCEL_TOKEN is required");

const vercelEnvironment = process.env.TARGET_ENV === "development" ? "preview" : "production";
const credentialPath = `.stripe-credentials-${process.pid}.env`;
const runtimePath = `.env.deploy-${process.pid}`;
const vercelRecords = readVercelEnvironmentRecords();
const vercelEnvRunEnvironment = withoutEmptyEnvironmentValues({
  ...process.env,
  ...(isUnreadableVercelEnvironmentRecord(vercelRecords.get("STRIPE_WEBHOOK_SECRET"))
    ? { MARKETPLACE_STRIPE_WEBHOOK_SECRET_PRESENT: "true" }
    : {}),
});

try {
  run("npx", [
    "--yes",
    pinnedNpxPackage("vercel"),
    "env",
    "run",
    "--environment",
    vercelEnvironment,
    "--token",
    process.env.VERCEL_TOKEN,
    "--",
    "node",
    "scripts/provision-stripe-webhook.mjs",
    "--credentials-file",
    credentialPath,
  ], { env: vercelEnvRunEnvironment });

  const credentials = await readOptionalCredentials(credentialPath);
  for (const [key, value] of Object.entries(credentials)) process.env[key] = value;

  if (providerMode !== "skip") {
    run(process.execPath, ["scripts/configure-providers.mjs", `--${providerMode}`]);
  }

  run(process.execPath, ["scripts/generate-env.mjs", "--check", "--allow-missing-provisioned"]);
  run(process.execPath, ["scripts/generate-env.mjs", "--write", runtimePath, "--allow-missing-provisioned"]);
  run(process.execPath, ["scripts/sync-vercel-env.mjs", runtimePath, "--preserve-unset-optional"]);
  console.log(`Runtime environment ${process.env.TARGET_ENV} reconciled successfully.`);
} finally {
  await Promise.all([rm(credentialPath, { force: true }), rm(runtimePath, { force: true })]);
}

async function readOptionalCredentials(path) {
  try {
    return parseDotenv(await readFile(path, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return {};
    throw error;
  }
}

function readVercelEnvironmentRecords() {
  const result = run("npx", [
    "--yes",
    pinnedNpxPackage("vercel"),
    "env",
    "ls",
    vercelEnvironment,
    "--format",
    "json",
    "--token",
    process.env.VERCEL_TOKEN,
  ], { capture: true });
  try {
    return genericVercelEnvironmentRecords(parseVercelEnvironmentList(result.stdout));
  } catch (error) {
    fail(error?.message || String(error));
  }
}

function argumentValue(flag) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] || "" : "";
}
function run(command, args, options = {}) {
  const printable = [command, ...args].map(redactArgument).join(" ");
  console.log(`\n$ ${printable}`);
  const result = spawnSync(command, args, {
    encoding: options.capture ? "utf8" : undefined,
    env: options.env || process.env,
    stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit",
  });
  if (result.error) fail(`${printable} failed to start: ${result.error.message}`);
  if (result.status !== 0) {
    const detail = options.capture
      ? `\n${[result.stderr, result.stdout].filter(Boolean).join("\n").trim()}`
      : "";
    fail(`${printable} failed with exit code ${result.status}${detail}`);
  }
  return result;
}
function redactArgument(value) {
  return value === process.env.VERCEL_TOKEN ? "[redacted-vercel-token]" : value;
}
function fail(message) {
  console.error(message);
  process.exit(1);
}
