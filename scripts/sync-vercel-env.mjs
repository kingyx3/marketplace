#!/usr/bin/env node
import { createHash, createHmac } from "node:crypto";
import { appendFile, readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import {
  ENV_CONTRACT,
  isRequiredEnvironmentEntry,
  parseDotenv,
} from "./generate-env.mjs";
import { withoutEmptyEnvironmentValues } from "./lib/process-environment.mjs";
import {
  genericVercelEnvironmentRecords,
  isUnreadableVercelEnvironmentRecord,
  parseVercelEnvironmentList,
} from "./lib/vercel-environment.mjs";
import { pinnedNpxPackage } from "./tool-versions.mjs";

const args = process.argv.slice(2);
const { dotenvPath } = parseArguments(args);
const preserveUnsetOptional = args.includes("--preserve-unset-optional");
const checkOnly = args.includes("--check-only");
const targetEnv = process.env.TARGET_ENV;
const token = process.env.VERCEL_TOKEN;

if (!targetEnv || !/^(development|staging|production)$/.test(targetEnv)) {
  fail("TARGET_ENV must be development, staging, or production");
}
if (!token) fail("VERCEL_TOKEN is required");

const vercelEnv = targetEnv === "development" ? "preview" : "production";
const dotenv = parseDotenv(await readFile(dotenvPath, "utf8"));
const desiredEnvironment = { ...process.env, ...dotenv };
const runtimeEntries = ENV_CONTRACT.filter((entry) => !entry.deployOnly);
const fingerprintKey = createHmac("sha256", token)
  .update("marketplace-runtime-env-fingerprint-v1")
  .digest("hex");
const currentRecords = readCurrentRecords();
const currentFingerprints = readCurrentFingerprints(fingerprintKey);
const expectedStates = new Map();
let added = 0;
let updated = 0;
let removed = 0;
let preserved = 0;
let unchanged = 0;

for (const entry of runtimeEntries) {
  const value = dotenv[entry.key];
  const required = isRequiredEnvironmentEntry(entry, desiredEnvironment);
  const record = currentRecords.get(entry.key);
  const currentFingerprint = currentFingerprints[entry.key];
  const currentExists = Boolean(record) || currentFingerprint !== undefined;
  const currentUnreadable = isUnreadableVercelEnvironmentRecord(record);

  if (value === undefined || value === "") {
    if (entry.provisioned && currentExists) {
      expectedStates.set(entry.key, currentFingerprint === undefined
        ? { mode: "exists" }
        : { mode: "value", fingerprint: currentFingerprint });
      preserved += 1;
      continue;
    }
    if (required) {
      fail(`Missing required desired Vercel environment variable: ${entry.key}`);
    }
    if (preserveUnsetOptional) {
      expectedStates.set(entry.key, currentFingerprint === undefined
        ? currentExists ? { mode: "exists" } : { mode: "absent" }
        : { mode: "value", fingerprint: currentFingerprint });
      preserved += 1;
      continue;
    }
    expectedStates.set(entry.key, { mode: "absent" });
    if (currentExists) {
      removed += 1;
      if (!checkOnly) runVercel(["env", "rm", entry.key, vercelEnv, "--yes", "--token", token]);
    } else unchanged += 1;
    continue;
  }

  const desiredFingerprint = fingerprint(value, fingerprintKey);
  expectedStates.set(entry.key, { mode: "value", fingerprint: desiredFingerprint });
  if (currentFingerprint === desiredFingerprint) {
    unchanged += 1;
    continue;
  }
  if (currentExists) {
    if (checkOnly && currentUnreadable) {
      unchanged += 1;
      continue;
    }
    updated += 1;
    if (!checkOnly) {
      runVercel(["env", "update", entry.key, vercelEnv, "--yes", "--token", token], {
        input: value,
      });
    }
  } else {
    added += 1;
    if (!checkOnly) {
      runVercel(["env", "add", entry.key, vercelEnv, "--force", "--token", token], {
        input: value,
      });
    }
  }
}

if (!checkOnly) await verifyPersistedState(fingerprintKey, expectedStates);

const deploymentFingerprint = createHash("sha256")
  .update(JSON.stringify(deploymentFingerprintEntries(expectedStates)))
  .digest("hex");
if (!checkOnly && process.env.GITHUB_ENV) {
  await appendFile(process.env.GITHUB_ENV, `VERCEL_DEPLOYMENT_CONFIG_FINGERPRINT=${deploymentFingerprint}\n`, "utf8");
}
const summary = `Vercel ${targetEnv}/${vercelEnv} env ${checkOnly ? "checked" : "reconciled"}: ${added} added, ${updated} updated, ${removed} removed, ${preserved} preserved, ${unchanged} unchanged.`;
console.log(summary);
if (checkOnly && added + updated + removed > 0) fail(`Vercel runtime drift detected. ${summary}`);

function parseArguments(values) {
  let dotenvPath = ".env.deploy";
  let sawDotenvPath = false;
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === "--preserve-unset-optional" || value === "--check-only") continue;
    if (value.startsWith("--")) fail(`Unknown option: ${value}`);
    if (sawDotenvPath) fail(`Unexpected positional argument: ${value}`);
    dotenvPath = value;
    sawDotenvPath = true;
  }
  return { dotenvPath };
}

function readCurrentRecords() {
  const result = runVercel(
    ["env", "ls", vercelEnv, "--format", "json", "--token", token],
    { capture: true }
  );
  try {
    return genericVercelEnvironmentRecords(parseVercelEnvironmentList(result.stdout));
  } catch (error) {
    fail(error?.message || String(error));
  }
}

function readCurrentFingerprints(key) {
  const cleanEnv = { ...process.env, MARKETPLACE_ENV_FINGERPRINT_KEY: key };
  for (const entry of runtimeEntries) delete cleanEnv[entry.key];
  const result = runVercel(
    [
      "env",
      "run",
      "--environment",
      vercelEnv,
      "--token",
      token,
      "--",
      "node",
      "scripts/fingerprint-runtime-env.mjs",
    ],
    { env: withoutEmptyEnvironmentValues(cleanEnv), capture: true }
  );
  const jsonLine = result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .findLast((line) => line.startsWith("{") && line.endsWith("}"));
  if (!jsonLine) fail("Vercel env fingerprint command did not return JSON");
  try {
    return JSON.parse(jsonLine);
  } catch {
    fail("Vercel env fingerprint command returned malformed JSON");
  }
}

async function verifyPersistedState(key, expected) {
  let drift = [];
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    drift = describeDrift(expected, readCurrentRecords(), readCurrentFingerprints(key));
    if (drift.length === 0) return;
    if (attempt < 5) await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** (attempt - 1)));
  }
  fail(`Vercel runtime environment did not persist the reconciled state: ${drift.join(", ")}`);
}

function describeDrift(expected, records, fingerprints) {
  const drift = [];
  for (const [key, state] of expected) {
    const record = records.get(key);
    const actualFingerprint = fingerprints[key];
    const exists = Boolean(record) || actualFingerprint !== undefined;
    if (state.mode === "absent") {
      if (exists) drift.push(`${key}:expected-absent`);
      continue;
    }
    if (state.mode === "exists") {
      if (!exists) drift.push(`${key}:missing`);
      continue;
    }
    if (isUnreadableVercelEnvironmentRecord(record)) continue;
    if (actualFingerprint !== state.fingerprint) drift.push(`${key}:value-mismatch`);
  }
  return drift;
}

function deploymentFingerprintEntries(expected) {
  return [...expected.entries()]
    .filter(([, state]) => state.mode !== "absent")
    .map(([key, state]) => [key, state.mode === "value" ? state.fingerprint : "present"])
    .sort(([a], [b]) => a.localeCompare(b));
}

function fingerprint(value, key) {
  return createHmac("sha256", key).update(value).digest("hex");
}
function runVercel(args, options = {}) {
  const result = spawnSync("npx", ["--yes", pinnedNpxPackage("vercel"), ...args], {
    input: options.input,
    encoding: "utf8",
    env: options.env || process.env,
    stdio: options.capture ? ["ignore", "pipe", "pipe"] : ["pipe", "pipe", "pipe"],
  });
  if (result.error) fail(`Vercel command failed to start: ${result.error.message}`);
  if (result.status !== 0) {
    const stderr = result.stderr?.trim() ? `\n${result.stderr.trim()}` : "";
    const stdout = result.stdout?.trim() ? `\n${result.stdout.trim()}` : "";
    fail(`Vercel env reconciliation failed${stderr}${stdout}`);
  }
  return result;
}
function fail(message) {
  console.error(message);
  process.exit(1);
}
