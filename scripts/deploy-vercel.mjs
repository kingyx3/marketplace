#!/usr/bin/env node
import { createHash } from "node:crypto";
import { appendFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { pinnedNpxPackage } from "./tool-versions.mjs";

const targetEnv = process.env.TARGET_ENV;
const token = process.env.VERCEL_TOKEN;
const projectId = process.env.VERCEL_PROJECT_ID;
const configFingerprint = process.env.VERCEL_DEPLOYMENT_CONFIG_FINGERPRINT;
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;
if (!targetEnv || !/^(development|staging|production)$/.test(targetEnv)) {
  fail("TARGET_ENV must be development, staging, or production");
}
if (!token) fail("VERCEL_TOKEN is required");
if (!projectId) fail("VERCEL_PROJECT_ID is required");
if (!supabaseSecretKey) fail("SUPABASE_SECRET_KEY must be resolved before deployment");
if (!configFingerprint)
  fail("VERCEL_DEPLOYMENT_CONFIG_FINGERPRINT is required after runtime env reconciliation");

const target = targetEnv === "development" ? "preview" : "production";
const revision = sourceRevision();
const deploymentKey = createHash("sha256")
  .update(`${targetEnv}\n${target}\n${revision}\n${configFingerprint}`)
  .digest("hex");
const reuseEnabled = targetEnv !== "development";
const existing = reuseEnabled ? await findReadyDeployment(deploymentKey) : null;
if (existing) {
  const deploymentUrl = normalizeDeploymentUrl(existing.url);
  console.log(`Reusing ready ${targetEnv} Vercel deployment for revision ${revision}.`);
  await exportDeploymentUrl(deploymentUrl);
  process.exit(0);
}
if (!reuseEnabled) {
  console.log(
    "Creating a fresh development Vercel deployment so reconciled runtime environment changes are applied."
  );
}

const args = [
  "--yes",
  pinnedNpxPackage("vercel"),
  "deploy",
  "--yes",
  "--token",
  token,
  "--meta",
  `marketplaceDeploymentKey=${deploymentKey}`,
  "--meta",
  `githubCommitSha=${revision}`,
  "--meta",
  `marketplaceEnvironment=${targetEnv}`,
  "--build-env",
  `NEXT_PUBLIC_SENTRY_ENVIRONMENT=${targetEnv}`,
  "--env",
  `NEXT_PUBLIC_SENTRY_ENVIRONMENT=${targetEnv}`,
  "--env",
  `SUPABASE_SECRET_KEY=${supabaseSecretKey}`,
];
if (target !== "preview") args.push("--prod");
const result = spawnSync("npx", args, {
  encoding: "utf8",
  env: process.env,
  stdio: ["ignore", "pipe", "pipe"],
});
if (result.error) fail(`Vercel deploy failed to start: ${result.error.message}`);
if (result.status !== 0) {
  const stderr = result.stderr?.trim() ? `\n${result.stderr.trim()}` : "";
  fail(`Vercel deploy failed${stderr}`);
}
const deploymentUrl = result.stdout.trim().split(/\r?\n/).filter(Boolean).at(-1);
if (!deploymentUrl || !/^https?:\/\//.test(deploymentUrl)) {
  fail("Vercel deploy did not return a deployment URL");
}
await exportDeploymentUrl(deploymentUrl);

async function findReadyDeployment(key) {
  const url = new URL("https://api.vercel.com/v7/deployments");
  url.searchParams.set("projectId", projectId);
  url.searchParams.set("state", "READY");
  url.searchParams.set("limit", "100");
  if (process.env.VERCEL_ORG_ID?.startsWith("team_")) {
    url.searchParams.set("teamId", process.env.VERCEL_ORG_ID);
  }
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) {
    fail(`Could not list Vercel deployments (${response.status}): ${await response.text()}`);
  }
  const payload = await response.json();
  const deployments = Array.isArray(payload?.deployments) ? payload.deployments : [];
  return deployments.find(
    (deployment) =>
      (deployment?.state === "READY" || deployment?.readyState === "READY") &&
      deployment?.meta &&
      typeof deployment.meta === "object" &&
      deployment.meta.marketplaceDeploymentKey === key
  );
}

function sourceRevision() {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA;
  const result = spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" });
  if (result.status === 0 && result.stdout.trim()) return result.stdout.trim();
  fail("Could not determine the source revision for idempotent deployment");
}
function normalizeDeploymentUrl(value) {
  if (!value) fail("Existing Vercel deployment did not include a URL");
  return /^https?:\/\//.test(value) ? value : `https://${value}`;
}
async function exportDeploymentUrl(deploymentUrl) {
  console.log(deploymentUrl);
  if (process.env.GITHUB_OUTPUT) {
    await appendFile(process.env.GITHUB_OUTPUT, `deployment_url=${deploymentUrl}\n`, "utf8");
  }
}
function fail(message) {
  console.error(message);
  process.exit(1);
}
