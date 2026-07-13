#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { readFile, rm } from "node:fs/promises";
import { applyVersionedEnvironmentConfig } from "./environment-config.mjs";
import { ENV_CONTRACT, loadLocalDotenv, parseDotenv } from "./generate-env.mjs";
import {
  buildEnvironmentWithVercelFallback,
  fetchVercelEnvironmentRecords,
  genericVercelEnvironmentRecords,
  isUnreadableVercelEnvironmentRecord,
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
  const credentialPath = `.stripe-credentials-${process.pid}.env`;
  const runtimePath = `.env.deploy-${process.pid}`;
  const context = await resolveVercelProjectContext(process.env);
  const records = await fetchVercelEnvironmentRecords({
    ...context,
    target: vercelEnvironment,
    decrypt: true,
  });
  const recordsByKey = genericVercelEnvironmentRecords(records, vercelEnvironment);
  const runtimeKeys = ENV_CONTRACT.filter((entry) => !entry.deployOnly).map((entry) => entry.key);
  const storedSigningSecretPresent = isUnreadableVercelEnvironmentRecord(
    recordsByKey.get("STRIPE_WEBHOOK_SECRET")
  );
  const provisionEnvironment = buildEnvironmentWithVercelFallback({
    records,
    runtimeKeys,
    baseEnv: process.env,
    target: vercelEnvironment,
  });
  if (storedSigningSecretPresent) {
    provisionEnvironment.MARKETPLACE_STRIPE_WEBHOOK_SECRET_PRESENT = "true";
  } else {
    delete provisionEnvironment.MARKETPLACE_STRIPE_WEBHOOK_SECRET_PRESENT;
  }
  process.env.MARKETPLACE_DISABLE_LOCAL_DOTENV = "true";

  try {
    run(
      process.execPath,
      ["scripts/provision-stripe-webhook.mjs", "--credentials-file", credentialPath],
      { env: provisionEnvironment }
    );

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
}

async function readOptionalCredentials(path) {
  try {
    return parseDotenv(await readFile(path, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return {};
    throw error;
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
