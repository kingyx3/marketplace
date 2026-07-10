#!/usr/bin/env node
import { appendFile, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { parseDotenv } from "./generate-env.mjs";

const GENERATED_RUNTIME_KEYS = Object.freeze([
  { key: "STRIPE_WEBHOOK_SECRET", pattern: /^whsec_/ },
]);

const targetEnv = process.env.TARGET_ENV || "";
const token = process.env.VERCEL_TOKEN || "";
const githubEnv = process.env.GITHUB_ENV || "";

if (!/^(development|production)$/.test(targetEnv)) fail("TARGET_ENV must be development or production");
if (!token) fail("VERCEL_TOKEN is required to restore generated runtime secrets");
if (!githubEnv) fail("GITHUB_ENV is required to restore generated runtime secrets");

const missingKeys = GENERATED_RUNTIME_KEYS.filter(({ key }) => !process.env[key]);
if (missingKeys.length === 0) {
  console.log("Generated runtime secrets are already present in the GitHub Environment.");
  process.exit(0);
}

const directory = await mkdtemp(join(tmpdir(), "marketplace-vercel-env-"));
const dotenvPath = join(directory, ".env.generated");

try {
  const vercelEnv = targetEnv === "production" ? "production" : "preview";
  const result = spawnSync(
    "npx",
    ["vercel", "env", "pull", dotenvPath, "--environment", vercelEnv, "--yes", "--token", token],
    {
      encoding: "utf8",
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    }
  );

  if (result.status !== 0) {
    const stderr = result.stderr && result.stderr.trim() ? `\n${result.stderr.trim()}` : "";
    fail(`vercel env pull failed${stderr}`);
  }

  const restored = parseDotenv(await readFile(dotenvPath, "utf8"));
  const exported = [];

  for (const { key, pattern } of missingKeys) {
    const value = restored[key];
    if (!value) continue;
    if (!pattern.test(value)) fail(`Vercel contains a malformed generated runtime secret: ${key}`);

    console.log(`::add-mask::${value}`);
    await appendFile(githubEnv, `${key}=${value}\n`, "utf8");
    exported.push(key);
  }

  if (exported.length > 0) {
    console.log(`Restored generated runtime secret(s) from Vercel: ${exported.join(", ")}`);
  } else {
    console.log("No generated runtime secrets were present in Vercel; provider provisioning will create them.");
  }
} finally {
  await rm(directory, { recursive: true, force: true });
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
