#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { appendFile } from "node:fs/promises";

const targetEnv = process.env.TARGET_ENV;
const token = process.env.VERCEL_TOKEN;

if (!targetEnv || !/^(development|production)$/.test(targetEnv)) {
  fail("TARGET_ENV must be development or production");
}
if (!token) {
  fail("VERCEL_TOKEN is required");
}

const args = ["vercel", "deploy", "--yes"];
if (targetEnv === "production") args.push("--prod");

const result = spawnSync("npx", args, {
  encoding: "utf8",
  env: process.env,
  stdio: ["ignore", "pipe", "pipe"],
});

if (result.status !== 0) {
  const stderr = result.stderr && result.stderr.trim() ? "\n" + result.stderr.trim() : "";
  fail("vercel deploy failed" + stderr);
}

const deploymentUrl = result.stdout.trim().split(/\r?\n/).filter(Boolean).at(-1);
if (!deploymentUrl || !/^https?:\/\//.test(deploymentUrl)) {
  fail("vercel deploy did not return a deployment URL");
}

console.log(deploymentUrl);
if (process.env.GITHUB_OUTPUT) {
  await appendFile(process.env.GITHUB_OUTPUT, `deployment_url=${deploymentUrl}\n`, "utf8");
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
