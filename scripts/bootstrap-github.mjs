#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const deploymentEnvironments = ["development", "staging", "production"];
const target = readOption("--target") || "development";
if (!new Set(deploymentEnvironments).has(target)) {
  fail("--target must be development, staging, or production");
}

const repo = capture("gh", ["repo", "view", "--json", "nameWithOwner", "--jq", ".nameWithOwner"]).trim();
if (!repo) fail("Could not resolve the current GitHub repository.");
run("gh", ["auth", "status"]);

const sharedSecrets = ["GCP_TERRAFORM_CREDENTIALS_JSON", "VERCEL_TOKEN", "SUPABASE_ACCESS_TOKEN"];
const sharedSentryVariables = ["NEXT_PUBLIC_SENTRY_DSN", "SENTRY_ORG", "SENTRY_PROJECT"];
const sharedSentrySecrets = ["SENTRY_AUTH_TOKEN"];
const sharedVariableValues = {
  ENABLE_RELEASE_TOPOLOGY: booleanValue("ENABLE_RELEASE_TOPOLOGY", false),
};
const commonVariables = [
  "NEXT_PUBLIC_SITE_URL",
  "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
  "GOOGLE_AUTH_ENABLED",
  "GOOGLE_OAUTH_CLIENT_ID",
  "RESEND_FROM_EMAIL",
  "SUPPORT_EMAIL",
];
const redundantEnvironmentSentryVariables = [
  "NEXT_PUBLIC_SENTRY_DSN",
  "SENTRY_DSN",
  "NEXT_PUBLIC_SENTRY_ENVIRONMENT",
  "SENTRY_ENVIRONMENT",
  "NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE",
  "SENTRY_TRACES_SAMPLE_RATE",
  "NEXT_PUBLIC_SENTRY_REPLAYS_SESSION_SAMPLE_RATE",
  "NEXT_PUBLIC_SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE",
  "SENTRY_RELEASE",
  "SENTRY_ORG",
  "SENTRY_PROJECT",
];
const hostedOperationsVariables = [
  "OPERATIONS_OWNER",
  "INCIDENT_ESCALATION_URL",
  "CHECKOUT_AVAILABILITY_SLO_PERCENT",
  "CHECKOUT_LATENCY_SLO_MS",
  "PAYMENT_RECONCILIATION_SLO_MINUTES",
];
const commonSecrets = [
  "SUPABASE_SECRET_KEY",
  "STRIPE_SECRET_KEY",
  "GOOGLE_OAUTH_CLIENT_SECRET",
  "STRIPE_WEBHOOK_SECRET",
  "CRON_SECRET",
  "SYNTHETIC_MONITOR_SECRET",
  "OPERATIONAL_ALERT_WEBHOOK_URL",
  "OPERATIONAL_ALERT_WEBHOOK_SECRET",
  "RESEND_API_KEY",
];
const targetVariables = {
  development: [],
  staging: [
    "RECOVERY_PROJECT_REF",
    "RESTORE_RTO_SECONDS",
    ...hostedOperationsVariables,
  ],
  production: [
    "SUPABASE_MINIMUM_BACKUP_RETENTION_DAYS",
    "SUPABASE_ADVISOR_ALLOWLIST",
    ...hostedOperationsVariables,
  ],
};
const targetSecrets = {
  development: [],
  staging: ["STAGING_DATABASE_URL", "RECOVERY_DATABASE_URL"],
  production: [],
};
const environmentVariables = [...commonVariables, ...targetVariables[target]];
const environmentSecrets = [...commonSecrets, ...targetSecrets[target]];

console.log(`${apply ? "Applying" : "Planning"} GitHub bootstrap for ${repo}/${target}.`);
for (const name of sharedSecrets) reportInput(name, process.env[name], true);
for (const [name, value] of Object.entries(sharedVariableValues)) reportInput(name, value, true);
for (const name of sharedSentryVariables) {
  reportInput(name, process.env[name], target !== "development");
}
for (const name of sharedSentrySecrets) {
  reportInput(name, process.env[name], target !== "development");
}
console.log(`\n${target}:`);
for (const name of environmentVariables) {
  reportInput(`${environmentPrefix(target)}_${name}`, environmentValue(target, name), variableIsRequired(name));
}
for (const name of environmentSecrets) {
  reportInput(`${environmentPrefix(target)}_${name}`, environmentValue(target, name), secretIsRequired(name));
}
if (target === "production") reportInput("PRODUCTION_REVIEWERS", process.env.PRODUCTION_REVIEWERS, true);

if (!apply) {
  console.log("\nNo changes made. Export the named values and rerun with --apply.");
  process.exit(0);
}

for (const name of sharedSecrets) setSecret(name, requiredEnv(name));
for (const [name, value] of Object.entries(sharedVariableValues)) setRepositoryVariable(name, value);
for (const name of sharedSentryVariables) {
  const value = process.env[name] || "";
  if (value) setRepositoryVariable(name, value);
  else if (target !== "development") {
    const purpose = name === "NEXT_PUBLIC_SENTRY_DSN" ? "runtime capture" : "source maps";
    fail(`${name} is required for hosted Sentry ${purpose}`);
  }
}
for (const name of sharedSentrySecrets) {
  const value = process.env[name] || "";
  if (value) setSecret(name, value);
  else if (target !== "development") fail(`${name} is required for hosted Sentry source maps`);
}
ensureEnvironment(target);
for (const environment of deploymentEnvironments) {
  for (const name of redundantEnvironmentSentryVariables) {
    deleteEnvironmentSettingIfPresent("variable", environment, name);
  }
  deleteEnvironmentSettingIfPresent("secret", environment, "SENTRY_AUTH_TOKEN");
}
for (const pattern of deploymentPolicies(target)) ensureDeploymentPolicy(target, pattern);
for (const name of environmentVariables) {
  const supplied = environmentValue(target, name);
  if (supplied) setVariable(target, name, supplied);
  else if (name === "GOOGLE_AUTH_ENABLED") setVariable(target, name, "true");
  else if (name === "RESTORE_RTO_SECONDS") setVariable(target, name, "1800");
  else if (name === "SUPABASE_MINIMUM_BACKUP_RETENTION_DAYS") setVariable(target, name, "7");
  else if (name === "CHECKOUT_AVAILABILITY_SLO_PERCENT") setVariable(target, name, "99.9");
  else if (name === "CHECKOUT_LATENCY_SLO_MS") setVariable(target, name, "5000");
  else if (name === "PAYMENT_RECONCILIATION_SLO_MINUTES") setVariable(target, name, "15");
  else if (variableIsRequired(name)) fail(`${environmentPrefix(target)}_${name} is required`);
}
for (const name of environmentSecrets) {
  const value = environmentValue(target, name);
  if (value) setSecret(name, value, target);
  else if (secretIsRequired(name)) fail(`${environmentPrefix(target)}_${name} is required`);
}
console.log(`GitHub ${target} environment, policies, variables, and supplied secrets are converged.`);

function variableIsRequired(name) {
  if (["SUPABASE_ADVISOR_ALLOWLIST", "GOOGLE_OAUTH_CLIENT_ID", "SUPPORT_EMAIL"].includes(name)) {
    return false;
  }
  return true;
}
function secretIsRequired(name) {
  if (["SUPABASE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"].includes(name)) return false;
  if (name === "GOOGLE_OAUTH_CLIENT_SECRET") return false;
  if (
    target === "development" &&
    [
      "CRON_SECRET",
      "SYNTHETIC_MONITOR_SECRET",
      "OPERATIONAL_ALERT_WEBHOOK_URL",
      "OPERATIONAL_ALERT_WEBHOOK_SECRET",
      "RESEND_API_KEY",
    ].includes(name)
  ) {
    return false;
  }
  return true;
}
function deploymentPolicies(environment) {
  if (environment === "development") return ["develop", "main"];
  return ["main", "v*"];
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
function deleteEnvironmentSettingIfPresent(kind, environment, name) {
  const commandArgs = [kind, "delete", name, "--repo", repo, "--env", environment];
  const result = spawnSync("gh", commandArgs, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status === 0) {
    console.log(`${environment} ${kind} ${name}: removed redundant override`);
    return;
  }
  if (/not found|404/i.test(result.stderr || "")) return;
  fail(`gh ${commandArgs.join(" ")} failed${result.stderr ? `: ${result.stderr.trim()}` : ""}`);
}
function requestedProductionReviewers() {
  const reviewers = String(process.env.PRODUCTION_REVIEWERS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return reviewers.map((login) => {
    const user = JSON.parse(capture("gh", ["api", `users/${login}`]));
    return { type: "User", id: user.id };
  });
}
function currentReviewers(environment) {
  const rule = (environment?.protection_rules || []).find((candidate) => candidate.type === "required_reviewers");
  return (rule?.reviewers || [])
    .map((reviewer) => ({
      type: reviewer.type === "Team" ? "Team" : "User",
      id: reviewer.id,
    }))
    .filter((reviewer) => reviewer.id);
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
function setRepositoryVariable(name, value) {
  run("gh", ["variable", "set", name, "--repo", repo, "--body", value], { quiet: true });
  console.log(`repository variable ${name}: set`);
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
function environmentPrefix(environment) {
  return environment.toUpperCase();
}
function requiredEnv(name) {
  const value = process.env[name] || "";
  if (!value) fail(`${name} is required`);
  return value;
}
function booleanValue(name, fallback) {
  const value = String(process.env[name] ?? "").trim().toLowerCase();
  if (!value) return String(fallback);
  if (value === "true" || value === "false") return value;
  fail(`${name} must be true or false`);
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
