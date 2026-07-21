#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const apply = process.argv.includes("--apply");
const repository = capture([
  "repo",
  "view",
  "--json",
  "nameWithOwner",
  "--jq",
  ".nameWithOwner",
]).trim();
if (!repository) fail("Could not resolve the current GitHub repository");

const requiredChecks = [
  "changes",
  "config-contract",
  "terraform-validation (bootstrap)",
  "terraform-validation (platform)",
  "app-checks / lint",
  "app-checks / typecheck",
  "app-checks / test",
  "app-checks / build",
  "app-checks / e2e",
  "migrations",
];
const endpoint = `repos/${repository}/branches/main/protection`;
const desired = {
  required_status_checks: { strict: true, contexts: requiredChecks },
  enforce_admins: true,
  required_pull_request_reviews: {
    dismiss_stale_reviews: true,
    require_code_owner_reviews: false,
    required_approving_review_count: 1,
    require_last_push_approval: true,
  },
  restrictions: null,
  required_linear_history: true,
  allow_force_pushes: false,
  allow_deletions: false,
  block_creations: false,
  required_conversation_resolution: true,
  lock_branch: false,
  allow_fork_syncing: false,
};

console.log(JSON.stringify({ repository, branch: "main", desired }, null, 2));
if (!apply) {
  console.log("No changes made. Re-run with --apply to reconcile main branch protection.");
  process.exit(0);
}

const result = spawnSync("gh", ["api", "--method", "PUT", endpoint, "--input", "-"], {
  input: JSON.stringify(desired),
  encoding: "utf8",
  stdio: ["pipe", "pipe", "pipe"],
});
if (result.error || result.status !== 0) {
  fail(`Could not reconcile main branch protection: ${result.stderr || result.error?.message}`);
}

const current = JSON.parse(capture(["api", endpoint]));
const currentContexts = new Set(current?.required_status_checks?.contexts || []);
const missingChecks = requiredChecks.filter((context) => !currentContexts.has(context));
const violations = [
  ...missingChecks.map((context) => `missing required status check: ${context}`),
  ...assertion(
    current?.required_status_checks?.strict === true,
    "required checks must be strict/up-to-date"
  ),
  ...assertion(
    current?.enforce_admins?.enabled === true,
    "branch protection must include administrators"
  ),
  ...assertion(
    current?.required_pull_request_reviews?.dismiss_stale_reviews === true,
    "stale approvals must be dismissed"
  ),
  ...assertion(
    (current?.required_pull_request_reviews?.required_approving_review_count || 0) >= 1,
    "at least one approval is required"
  ),
  ...assertion(
    current?.required_pull_request_reviews?.require_last_push_approval === true,
    "last push must be approved by someone else"
  ),
  ...assertion(
    current?.required_linear_history?.enabled === true,
    "linear history must be required"
  ),
  ...assertion(
    current?.required_conversation_resolution?.enabled === true,
    "review conversations must be resolved"
  ),
  ...assertion(current?.allow_force_pushes?.enabled !== true, "force pushes must remain disabled"),
  ...assertion(current?.allow_deletions?.enabled !== true, "branch deletion must remain disabled"),
];
if (violations.length > 0) {
  fail(`main branch protection did not converge:\n- ${violations.join("\n- ")}`);
}
console.log("main branch protection converged and verified");

function assertion(condition, message) {
  return condition ? [] : [message];
}

function capture(args) {
  const result = spawnSync("gh", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  if (result.error || result.status !== 0)
    fail(`gh ${args.join(" ")} failed: ${result.stderr || result.error?.message}`);
  return result.stdout;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
