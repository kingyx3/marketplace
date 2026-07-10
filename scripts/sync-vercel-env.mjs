#!/usr/bin/env node
import { createHash, createHmac } from "node:crypto";
import { appendFile, readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { ENV_CONTRACT, parseDotenv } from "./generate-env.mjs";
import { pinnedNpxPackage } from "./tool-versions.mjs";

const args = process.argv.slice(2);
const dotenvPath = args.find((arg) => !arg.startsWith("--")) || ".env.deploy";
const preserveUnsetOptional = args.includes("--preserve-unset-optional");
const checkOnly = args.includes("--check-only");
const targetEnv = process.env.TARGET_ENV;
const token = process.env.VERCEL_TOKEN;

if (!targetEnv || !/^(development|production)$/.test(targetEnv)) fail("TARGET_ENV must be development or production");
if (!token) fail("VERCEL_TOKEN is required");

const vercelEnv = targetEnv === "production" ? "production" : "preview";
const dotenv = parseDotenv(await readFile(dotenvPath, "utf8"));
const runtimeEntries = ENV_CONTRACT.filter((entry) => !entry.deployOnly);
const fingerprintKey = createHmac("sha256", token)
  .update("marketplace-runtime-env-fingerprint-v1")
  .digest("hex");
const current = readCurrentFingerprints(fingerprintKey);
const effective = {};
let added = 0;
let updated = 0;
let removed = 0;
let preserved = 0;
let unchanged = 0;

for (const entry of runtimeEntries) {
  const value = dotenv[entry.key];
  const currentFingerprint = current[entry.key];
  const currentExists = currentFingerprint !== undefined;

  if (value === undefined || value === "") {
    if (preserveUnsetOptional && !entry.required) {
      if (currentExists) effective[entry.key] = currentFingerprint;
      preserved += 1;
      continue;
    }
    if (currentExists) {
      removed += 1;
      if (!checkOnly) runVercel(["env", "rm", entry.key, vercelEnv, "--yes", "--token", token]);
    } else unchanged += 1;
    continue;
  }

  const desiredFingerprint = fingerprint(value, fingerprintKey);
  effective[entry.key] = desiredFingerprint;
  if (currentFingerprint === desiredFingerprint) {
    unchanged += 1;
    continue;
  }
  if (currentExists) {
    updated += 1;
    if (!checkOnly) runVercel(["env", "update", entry.key, vercelEnv, "--yes", "--token", token], { input: value });
  } else {
    added += 1;
    if (!checkOnly) runVercel(["env", "add", entry.key, vercelEnv, "--force", "--token", token], { input: value });
  }
}

const deploymentFingerprint = createHash("sha256")
  .update(JSON.stringify(Object.fromEntries(Object.entries(effective).sort(([a], [b]) => a.localeCompare(b)))))
  .digest("hex");
if (!checkOnly && process.env.GITHUB_ENV) {
  await appendFile(process.env.GITHUB_ENV, `VERCEL_DEPLOYMENT_CONFIG_FINGERPRINT=${deploymentFingerprint}\n`, "utf8");
}
const summary = `Vercel ${vercelEnv} env ${checkOnly ? "checked" : "reconciled"}: ${added} added, ${updated} updated, ${removed} removed, ${preserved} preserved, ${unchanged} unchanged.`;
console.log(summary);
if (checkOnly && added + updated + removed > 0) fail(`Vercel runtime drift detected. ${summary}`);

function readCurrentFingerprints(key) {
  const cleanEnv = { ...process.env, MARKETPLACE_ENV_FINGERPRINT_KEY: key };
  for (const entry of runtimeEntries) delete cleanEnv[entry.key];
  const result = runVercel([
    "env", "run", "--environment", vercelEnv, "--token", token, "--",
    "node", "scripts/fingerprint-runtime-env.mjs",
  ], { env: cleanEnv, capture: true });
  const jsonLine = result.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
    .findLast((line) => line.startsWith("{") && line.endsWith("}"));
  if (!jsonLine) fail("Vercel env fingerprint command did not return JSON");
  try { return JSON.parse(jsonLine); } catch { fail("Vercel env fingerprint command returned malformed JSON"); }
}

function fingerprint(value, key) { return createHmac("sha256", key).update(value).digest("hex"); }

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
    fail(`Vercel env reconciliation failed${stderr}`);
  }
  return result;
}

function fail(message) { console.error(message); process.exit(1); }
