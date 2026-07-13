#!/usr/bin/env node
import { createHash, createHmac } from "node:crypto";
import { appendFile, readFile } from "node:fs/promises";
import {
  ENV_CONTRACT,
  isRequiredEnvironmentEntry,
  parseDotenv,
} from "./generate-env.mjs";
import {
  createVercelEnvironmentRecord,
  deleteVercelEnvironmentRecord,
  fetchVercelEnvironmentRecords,
  genericVercelEnvironmentRecords,
  isUnreadableVercelEnvironmentRecord,
  readableVercelEnvironmentValue,
  resolveVercelProjectContext,
  updateVercelEnvironmentRecord,
} from "./lib/vercel-environment.mjs";

try {
  await main();
} catch (error) {
  fail(error?.message || String(error));
}

async function main() {
  const args = process.argv.slice(2);
  const { dotenvPath } = parseArguments(args);
  const preserveUnsetOptional = args.includes("--preserve-unset-optional");
  const rotateProvisioned = args.includes("--rotate-provisioned");
  const checkOnly = args.includes("--check-only");
  const targetEnv = process.env.TARGET_ENV;

  if (!targetEnv || !/^(development|staging|production)$/.test(targetEnv)) {
    fail("TARGET_ENV must be development, staging, or production");
  }
  if (checkOnly && rotateProvisioned) {
    fail("--rotate-provisioned cannot be combined with --check-only");
  }

  const vercelEnv = targetEnv === "development" ? "preview" : "production";
  const context = await resolveVercelProjectContext(process.env);
  const dotenv = parseDotenv(await readFile(dotenvPath, "utf8"));
  const desiredEnvironment = { ...process.env, ...dotenv };
  const runtimeEntries = ENV_CONTRACT.filter((entry) => !entry.deployOnly);
  const fingerprintKey = createHmac("sha256", context.token)
    .update("marketplace-runtime-env-fingerprint-v1")
    .digest("hex");
  const current = await readCurrentState(context, vercelEnv, runtimeEntries, fingerprintKey);
  const expectedStates = new Map();
  const verificationStates = new Map();
  let added = 0;
  let updated = 0;
  let removed = 0;
  let preserved = 0;
  let verifiedByPresence = 0;
  let unchanged = 0;

  for (const entry of runtimeEntries) {
    const value = dotenv[entry.key];
    const required = isRequiredEnvironmentEntry(entry, desiredEnvironment);
    const record = current.records.get(entry.key);
    const currentFingerprint = current.fingerprints[entry.key];
    const currentExists = Boolean(record);
    const currentUnreadable = isUnreadableVercelEnvironmentRecord(record);

    if (value === undefined || value === "") {
      if (entry.provisioned && currentExists) {
        if (rotateProvisioned) {
          fail(`Cannot rotate provisioned Vercel environment variable without a desired value: ${entry.key}`);
        }
        const state = currentFingerprint === undefined
          ? { mode: "exists" }
          : { mode: "value", fingerprint: currentFingerprint };
        expectedStates.set(entry.key, state);
        verificationStates.set(entry.key, state);
        preserved += 1;
        continue;
      }
      if (required) {
        fail(`Missing required desired Vercel environment variable: ${entry.key}`);
      }
      if (preserveUnsetOptional) {
        const state = currentFingerprint === undefined
          ? currentExists ? { mode: "exists" } : { mode: "absent" }
          : { mode: "value", fingerprint: currentFingerprint };
        expectedStates.set(entry.key, state);
        verificationStates.set(entry.key, state);
        preserved += 1;
        continue;
      }
      expectedStates.set(entry.key, { mode: "absent" });
      verificationStates.set(entry.key, { mode: "absent" });
      if (currentExists) {
        removed += 1;
        if (!checkOnly) {
          await deleteVercelEnvironmentRecord({ ...context, record, target: vercelEnv });
        }
      } else unchanged += 1;
      continue;
    }

    if (currentExists && currentUnreadable) {
      expectedStates.set(entry.key, { mode: "exists" });
      verificationStates.set(entry.key, { mode: "exists" });
      if (checkOnly) {
        verifiedByPresence += 1;
        continue;
      }
      if (entry.provisioned && !rotateProvisioned) {
        preserved += 1;
        continue;
      }
      updated += 1;
      await updateVercelEnvironmentRecord({ ...context, record, value, target: vercelEnv });
      continue;
    }

    const desiredFingerprint = fingerprint(value, fingerprintKey);
    expectedStates.set(entry.key, { mode: "value", fingerprint: desiredFingerprint });
    if (currentFingerprint === desiredFingerprint) {
      verificationStates.set(entry.key, { mode: "value", fingerprint: desiredFingerprint });
      unchanged += 1;
      continue;
    }
    if (currentExists) {
      verificationStates.set(entry.key, { mode: "exists" });
      updated += 1;
      if (!checkOnly) {
        await updateVercelEnvironmentRecord({ ...context, record, value, target: vercelEnv });
      }
    } else {
      verificationStates.set(entry.key, { mode: "exists" });
      added += 1;
      if (!checkOnly) {
        await createVercelEnvironmentRecord({
          ...context,
          key: entry.key,
          value,
          target: vercelEnv,
          type: "encrypted",
        });
      }
    }
  }

  if (!checkOnly) {
    await verifyPersistedState(context, vercelEnv, runtimeEntries, fingerprintKey, verificationStates);
  }

  const deploymentFingerprint = createHash("sha256")
    .update(JSON.stringify(deploymentFingerprintEntries(expectedStates)))
    .digest("hex");
  if (!checkOnly && process.env.GITHUB_ENV) {
    await appendFile(
      process.env.GITHUB_ENV,
      `VERCEL_DEPLOYMENT_CONFIG_FINGERPRINT=${deploymentFingerprint}\n`,
      "utf8"
    );
  }
  const summary = `Vercel ${targetEnv}/${vercelEnv} env ${checkOnly ? "checked" : "reconciled"}: ${added} added, ${updated} updated, ${removed} removed, ${preserved} preserved, ${verifiedByPresence} verified by presence, ${unchanged} unchanged.`;
  console.log(summary);
  if (checkOnly && added + updated + removed > 0) {
    fail(`Vercel runtime drift detected. ${summary}`);
  }
}

function parseArguments(values) {
  let dotenvPath = ".env.deploy";
  let sawDotenvPath = false;
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (
      value === "--preserve-unset-optional" ||
      value === "--rotate-provisioned" ||
      value === "--check-only"
    ) continue;
    if (value.startsWith("--")) fail(`Unknown option: ${value}`);
    if (sawDotenvPath) fail(`Unexpected positional argument: ${value}`);
    dotenvPath = value;
    sawDotenvPath = true;
  }
  return { dotenvPath };
}

async function readCurrentState(context, vercelEnv, runtimeEntries, key) {
  const records = genericVercelEnvironmentRecords(
    await fetchVercelEnvironmentRecords({ ...context, target: vercelEnv, decrypt: true }),
    vercelEnv
  );
  const fingerprints = {};
  for (const entry of runtimeEntries) {
    const record = records.get(entry.key);
    if (!record || isUnreadableVercelEnvironmentRecord(record)) continue;
    const value = readableVercelEnvironmentValue(record);
    if (value === undefined) {
      throw new Error(
        `Vercel did not return a decrypted value for ${entry.key} (${record.type || "unknown"}); refusing unverifiable reconciliation.`
      );
    }
    fingerprints[entry.key] = fingerprint(value, key);
  }
  return { records, fingerprints };
}

async function verifyPersistedState(context, vercelEnv, runtimeEntries, key, expected) {
  let drift = [];
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    const current = await readCurrentState(context, vercelEnv, runtimeEntries, key);
    drift = describeDrift(expected, current.records, current.fingerprints);
    if (drift.length === 0) return;
    if (attempt < 6) await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** (attempt - 1)));
  }
  fail(`Vercel runtime environment did not persist the reconciled state: ${drift.join(", ")}`);
}

function describeDrift(expected, records, fingerprints) {
  const drift = [];
  for (const [key, state] of expected) {
    const record = records.get(key);
    const actualFingerprint = fingerprints[key];
    const exists = Boolean(record);
    if (state.mode === "absent") {
      if (exists) drift.push(`${key}:expected-absent`);
      continue;
    }
    if (state.mode === "exists") {
      if (!exists) drift.push(`${key}:missing`);
      continue;
    }
    if (isUnreadableVercelEnvironmentRecord(record)) continue;
    if (!exists) drift.push(`${key}:missing`);
    else if (actualFingerprint !== state.fingerprint) drift.push(`${key}:value-mismatch`);
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

function fail(message) {
  console.error(message);
  process.exit(1);
}
