#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { readFile, rm } from "node:fs/promises";
import { applyVersionedEnvironmentConfig } from "./environment-config.mjs";
import { loadLocalDotenv, parseDotenv } from "./generate-env.mjs";
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
  ]);

  const credentials = parseDotenv(await readFile(credentialPath, "utf8"));
  for (const [key, value] of Object.entries(credentials)) process.env[key] = value;

  if (providerMode !== "skip") {
    run(process.execPath, ["scripts/configure-providers.mjs", `--${providerMode}`]);
  }

  run(process.execPath, ["scripts/generate-env.mjs", "--check"]);
  run(process.execPath, ["scripts/generate-env.mjs", "--write", runtimePath]);
  run(process.execPath, ["scripts/sync-vercel-env.mjs", runtimePath, "--preserve-unset-optional"]);
  console.log(`Runtime environment ${process.env.TARGET_ENV} reconciled successfully.`);
} finally {
  await Promise.all([rm(credentialPath, { force: true }), rm(runtimePath, { force: true })]);
}

function argumentValue(flag) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] || "" : "";
}
function run(command, args) {
  const printable = [command, ...args].map(redactArgument).join(" ");
  console.log(`\n$ ${printable}`);
  const result = spawnSync(command, args, { env: process.env, stdio: "inherit" });
  if (result.error) fail(`${printable} failed to start: ${result.error.message}`);
  if (result.status !== 0) fail(`${printable} failed with exit code ${result.status}`);
}
function redactArgument(value) {
  return value === process.env.VERCEL_TOKEN ? "[redacted-vercel-token]" : value;
}
function fail(message) {
  console.error(message);
  process.exit(1);
}
