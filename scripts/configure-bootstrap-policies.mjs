#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const apply = process.argv.includes("--apply");
const repo = capture(["repo", "view", "--json", "nameWithOwner", "--jq", ".nameWithOwner"]).trim();
if (!repo) fail("Could not resolve the current GitHub repository");

const desired = [
  ["development", "main"],
  ["production", "main"],
];

for (const [environment, pattern] of desired) {
  console.log(`${environment} deployment policy ${pattern}: ${apply ? "reconcile" : "required"}`);
  if (apply) ensurePolicy(environment, pattern);
}

if (!apply) console.log("No deployment policies changed. Re-run with --apply to allow aggregate runs from main.");

function ensurePolicy(environment, pattern) {
  const endpoint = `repos/${repo}/environments/${environment}/deployment-branch-policies`;
  const current = JSON.parse(capture(["api", endpoint]));
  const policies = current.branch_policies || current.deployment_branch_policies || [];
  if (policies.some((entry) => entry.name === pattern)) {
    console.log(`${environment} deployment policy ${pattern}: unchanged`);
    return;
  }
  const result = spawnSync("gh", ["api", "--method", "POST", endpoint, "--input", "-"], {
    input: JSON.stringify({ name: pattern }),
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  });
  if (result.error || result.status !== 0) fail(`Could not add ${environment}/${pattern}: ${result.stderr || result.error?.message}`);
  console.log(`${environment} deployment policy ${pattern}: added`);
}

function capture(args) {
  const result = spawnSync("gh", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  if (result.error || result.status !== 0) fail(`gh ${args.join(" ")} failed: ${result.stderr || result.error?.message}`);
  return result.stdout;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
