#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const target = readOption("--target") || "development";
if (!new Set(["development", "production"]).has(target)) {
  fail("--target must be development or production");
}

const repo = capture("gh", ["repo", "view", "--json", "nameWithOwner", "--jq", ".nameWithOwner"]).trim();
if (!repo) fail("Could not resolve the current GitHub repository.");
run("gh", ["auth", "status"]);

const sharedSecrets = ["GCP_TERRAFORM_CREDENTIALS_JSON", "VERCEL_TOKEN", "SUPABASE_ACCESS_TOKEN"];
const environmentVariables = [
  "NEXT_PUBLIC_SITE_URL",
  "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
  "GOOGLE_AUTH_ENABLED",
  "GOOGLE_OAUTH_CLIENT_ID",
];
const environmentSecrets = [
  "SUPABASE_SECRET_KEY",
  "STRIPE_SECRET_KEY",
  "GOOGLE_OAUTH_CLIENT_SECRET",
  "STRIPE_WEBHOOK_SECRET",
];

console.log(`${apply ? "Applying" : "Planning"} GitHub bootstrap for ${repo}/${target}.`);
for (const name of sharedSecrets) reportInput(name, process.env[name], true);
console.log(`\n${target}:`);
for (const name of environmentVariables) {
  reportInput(`${environmentPrefix(target)}_${name}`, environmentValue(target, name), name !== "GOOGLE_AUTH_ENABLED");
}
for (const name of environmentSecrets) {
  reportInput(
    `${environmentPrefix(target)}_${name}`,
    environmentValue(target, name),
    name !== "SUPABASE_SECRET_KEY" && name !== "STRIPE_WEBHOOK_SECRET"
  );
}
if (target === "production") reportInput("PRODUCTION_REVIEWERS", process.env.PRODUCTION_REVIEWERS, true);

if (!apply) {
  console.log("\nNo changes made. Export the named values and rerun with --apply.");
  process.exit(0);
}

for (const name of sharedSecrets) setSecret(name, requiredEnv(name));
ensureEnvironment(target);
for (const pattern of deploymentPolicies(target)) ensureDeploymentPolicy(target, pattern);
for (const name of environmentVariables) {
  const value = name === "GOOGLE_AUTH_ENABLED"
    ? environmentValue(target, name) || "true"
    : requiredEnvironmentValue(target, name);
  setVariable(target, name, value);
}
for (const name of environmentSecrets) {
  const value = environmentValue(target, name);
  if (value) setSecret(name, value, target);
  else if (!["SUPABASE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"].includes(name)) {
    fail(`${environmentPrefix(target)}_${name} is required`);
  }
}
console.log(`GitHub ${target} environment, policies, variables, and supplied secrets are converged.`);

function deploymentPolicies(environment) {
  return environment === "development" ? ["develop", "main"] : ["main", "v*"];
}

function ensureEnvironment(environment) {
  const endpoint = `repos/${repo}/environments/${environment}`;
  const current = tryJson(["api", endpoint]);
  const requested = environment === "production" ? requestedProductionReviewers() : [];
  const preserved = current ? currentReviewers(current) : [];
  const reviewers = requested.length > 0 ? requested : preserved;
  if (environment === "production" && reviewers.length === 0) {
    fail("PRODUCTION_REVIEWERS is required when creating production without existing required reviewers");
  }
  const payload = {
    wait_timer: currentWaitTimer(current),
    prevent_self_review: environment === "production" ? true : Boolean(current?.prevent_self_review),
    reviewers,
    deployment_branch_policy: { protected_branches: false, custom_branch_policies: true },
  };
  runJson("gh", ["api", "--method", "PUT", endpoint, "--input", "-"], payload);
  console.log(`${environment} environment: ${current ? "updated/preserved" : "created"}`);
}

function ensureDeploymentPolicy(environment, pattern) {
  const endpoint = `repos/${repo}/environments/${environment}/deployment-branch-policies`;
  const current = JSON.parse(capture("gh", ["api", endpoint]));
  const policies = current.branch_policies || current.deployment_branch_policies || [];
  if (policies.some((entry) => entry.name === pattern)) {
    console.log(`${environment} deployment policy ${pattern}: unchanged`);
    return;
  }
  runJson("gh", ["api", "--method", "POST", endpoint, "--input", "-"], { name: pattern });
  console.log(`${environment} deployment policy ${pattern}: added`);
}

function requestedProductionReviewers() {
  const reviewers = String(process.env.PRODUCTION_REVIEWERS || "").split(",").map((value) => value.trim()).filter(Boolean);
  return reviewers.map((login) => {
    const user = JSON.parse(capture("gh", ["api", `users/${login}`]));
    return { type: "User", id: user.id };
  });
}

function currentReviewers(environment) {
  const rule = (environment?.protection_rules || []).find((candidate) => candidate.type === "required_reviewers");
  return (rule?.reviewers || []).map((reviewer) => ({
    type: reviewer.type === "Team" ? "Team" : "User",
    id: reviewer.id,
  })).filter((reviewer) => reviewer.id);
}

function currentWaitTimer(environment) {
  const rule = (environment?.protection_rules || []).find((candidate) => candidate.type === "wait_timer");
  return Number(rule?.wait_timer || 0);
}

function tryJson(commandArgs) {
  const result = spawnSync("gh", commandArgs, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  if (result.status === 0) return JSON.parse(result.stdout);
  if (/404|Not Found/i.test(result.stderr || "")) return null;
  fail(`gh ${commandArgs.join(" ")} failed: ${result.stderr || result.error?.message}`);
}

function setVariable(environment, name, value) {
  run("gh", ["variable", "set", name, "--repo", repo, "--env", environment, "--body", value], { quiet: true });
  console.log(`${environment} variable ${name}: set`);
}

function setSecret(name, value, environment = "") {
  const commandArgs = ["secret", "set", name, "--repo", repo];
  if (environment) commandArgs.push("--env", environment);
  run("gh", commandArgs, { input: value, quiet: true });
  console.log(`${environment || "repository"} secret ${name}: set`);
}

function readOption(name) {
  const inline = args.find((arg) => arg.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : "";
}

function environmentValue(environment, name) {
  return process.env[`${environmentPrefix(environment)}_${name}`] || "";
}
function requiredEnvironmentValue(environment, name) {
  return requiredEnv(`${environmentPrefix(environment)}_${name}`);
}
function environmentPrefix(environment) { return environment.toUpperCase(); }
function requiredEnv(name) {
  const value = process.env[name] || "";
  if (!value) fail(`${name} is required`);
  return value;
}
function reportInput(name, value, required) {
  console.log(`  ${name}: ${value ? "supplied" : required ? "MISSING" : "optional/not supplied"}`);
}
function runJson(command, commandArgs, payload) {
  run(command, commandArgs, { input: JSON.stringify(payload), quiet: true });
}
function capture(command, commandArgs) {
  const result = spawnSync(command, commandArgs, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  if (result.error || result.status !== 0) {
    fail(`${command} ${commandArgs.join(" ")} failed: ${result.stderr || result.error?.message}`);
  }
  return result.stdout;
}
function run(command, commandArgs, options = {}) {
  const result = spawnSync(command, commandArgs, {
    input: options.input,
    encoding: "utf8",
    stdio: options.quiet ? ["pipe", "pipe", "pipe"] : "inherit",
  });
  if (result.error || result.status !== 0) {
    fail(`${command} ${commandArgs.join(" ")} failed${result.stderr ? `: ${result.stderr.trim()}` : ""}`);
  }
  return result;
}
function fail(message) {
  console.error(message);
  process.exit(1);
}
