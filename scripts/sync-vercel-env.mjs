#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { ENV_CONTRACT, parseDotenv } from "./generate-env.mjs";

const dotenvPath = process.argv[2] || ".env.deploy";
const targetEnv = process.env.TARGET_ENV;
const token = process.env.VERCEL_TOKEN;

if (!targetEnv || !/^(development|staging|production)$/.test(targetEnv)) {
  fail("TARGET_ENV must be development, staging, or production");
}
if (!token) {
  fail("VERCEL_TOKEN is required");
}

const vercelEnv = targetEnv === "production" ? "production" : "preview";
const dotenv = parseDotenv(await readFile(dotenvPath, "utf8"));
const runtimeEntries = ENV_CONTRACT.filter((entry) => !entry.deployOnly);
let synced = 0;
let removed = 0;

for (const entry of runtimeEntries) {
  const value = dotenv[entry.key];
  run(["env", "rm", entry.key, vercelEnv, "--yes", "--token", token], true);

  if (value === undefined || value === "") {
    removed += 1;
    continue;
  }

  run(["env", "add", entry.key, vercelEnv, "--token", token], false, value);
  synced += 1;
}

console.log(`synced ${synced} runtime key(s) to Vercel ${vercelEnv}; removed ${removed} unset key(s)`);

function run(args, allowFailure = false, input = undefined) {
  const result = spawnSync("npx", ["vercel", ...args], {
    input,
    encoding: "utf8",
    env: process.env,
    stdio: ["pipe", "pipe", "pipe"],
  });

  if (result.status !== 0 && !allowFailure) {
    const stderr = result.stderr?.trim() ? `\n${result.stderr.trim()}` : "";
    fail(`vercel env sync command failed${stderr}`);
  }
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
