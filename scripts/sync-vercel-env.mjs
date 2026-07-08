#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { ENV_CONTRACT, parseDotenv } from "./generate-env.mjs";

const args = process.argv.slice(2);
const dotenvPath = args.find((arg) => !arg.startsWith("--")) || ".env.deploy";
const preserveUnsetOptional = args.includes("--preserve-unset-optional");
const targetEnv = process.env.TARGET_ENV;
const token = process.env.VERCEL_TOKEN;

if (!targetEnv || !/^(development|production)$/.test(targetEnv)) {
  fail("TARGET_ENV must be development or production");
}
if (!token) {
  fail("VERCEL_TOKEN is required");
}

const vercelEnv = targetEnv === "production" ? "production" : "preview";
const dotenv = parseDotenv(await readFile(dotenvPath, "utf8"));
const runtimeEntries = ENV_CONTRACT.filter((entry) => !entry.deployOnly);
let synced = 0;
let removed = 0;
let preserved = 0;

for (const entry of runtimeEntries) {
  const value = dotenv[entry.key];

  if (value === undefined || value === "") {
    if (preserveUnsetOptional && !entry.required) {
      preserved += 1;
      continue;
    }

    run(["env", "rm", entry.key, vercelEnv, "--yes", "--token", token], true);
    removed += 1;
    continue;
  }

  run(["env", "rm", entry.key, vercelEnv, "--yes", "--token", token], true);
  run(["env", "add", entry.key, vercelEnv, "--token", token], false, value);
  synced += 1;
}

console.log(
  "synced " + synced + " runtime key(s) to Vercel " + vercelEnv + "; removed " + removed + " unset key(s); preserved " + preserved + " unset optional key(s)"
);

function run(args, allowFailure = false, input = undefined) {
  const result = spawnSync("npx", ["vercel", ...args], {
    input,
    encoding: "utf8",
    env: process.env,
    stdio: ["pipe", "pipe", "pipe"],
  });

  if (result.status !== 0 && !allowFailure) {
    const stderr = result.stderr && result.stderr.trim() ? "\n" + result.stderr.trim() : "";
    fail("vercel env sync command failed" + stderr);
  }
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
