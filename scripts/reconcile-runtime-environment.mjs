#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { rm } from "node:fs/promises";

import { applyVersionedEnvironmentConfig } from "./environment-config.mjs";
import { ENV_CONTRACT, loadLocalDotenv } from "./generate-env.mjs";
import {
  buildEnvironmentWithVercelFallback,
  fetchVercelEnvironmentRecords,
  resolveVercelProjectContext,
} from "./lib/vercel-environment.mjs";

try {
  await main();
} catch (error) {
  fail(error?.message || String(error));
}

async function main() {
  await loadLocalDotenv(process.env);
  await applyVersionedEnvironmentConfig(process.env);

  const providerMode = argumentValue("--providers") || "apply-if-configured";
  if (!["skip", "plan", "apply", "apply-if-configured", "verify"].includes(providerMode)) {
    fail(`Unsupported --providers mode: ${providerMode}`);
  }
  if (!/^(development|staging|production)$/.test(process.env.TARGET_ENV || "")) {
    fail("TARGET_ENV must be development, staging, or production");
  }

  const vercelEnvironment = process.env.TARGET_ENV === "development" ? "preview" : "production";
  const runtimePath = `.env.deploy-${process.pid}`;
  const context = await resolveVercelProjectContext(process.env);
  const records = await fetchVercelEnvironmentRecords({
    ...context,
    target: vercelEnvironment,
    decrypt: true,
  });
  const runtimeKeys = ENV_CONTRACT.filter((entry) => !entry.deployOnly).map((entry) => entry.key);
  const provisionEnvironment = buildEnvironmentWithVercelFallback({
    records,
    runtimeKeys,
    baseEnv: process.env,
    target: vercelEnvironment,
  });
  for (const [key, value] of Object.entries(provisionEnvironment)) {
    process.env[key] = value;
  }
  process.env.MARKETPLACE_DISABLE_LOCAL_DOTENV = "true";

  try {
    if (providerMode !== "skip") {
      run(process.execPath, ["scripts/configure-providers.mjs", `--${providerMode}`]);
    }

    run(process.execPath, ["scripts/generate-env.mjs", "--check", "--allow-missing-provisioned"]);
    run(process.execPath, [
      "scripts/generate-env.mjs",
      "--write",
      runtimePath,
      "--allow-missing-provisioned",
    ]);
    run(process.execPath, [
      "scripts/sync-vercel-env.mjs",
      runtimePath,
      "--preserve-unset-optional",
    ]);
    console.log(`Runtime environment ${process.env.TARGET_ENV} reconciled successfully.`);
  } finally {
    await rm(runtimePath, { force: true });
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
    env: options.env || process.env,
    stdio: "inherit",
  });
  if (result.error) fail(`${printable} failed to start: ${result.error.message}`);
  if (result.status !== 0) fail(`${printable} failed with exit code ${result.status}`);
  return result;
}

function redactArgument(value) {
  return value === process.env.VERCEL_TOKEN ? "[redacted-vercel-token]" : value;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
