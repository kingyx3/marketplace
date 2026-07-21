#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const target = readOption("--target") || "development";
if (!new Set(["development", "staging", "production"]).has(target)) {
  fail("--target must be development, staging, or production");
}

const applyArg = apply ? ["--apply"] : [];
run(process.execPath, ["scripts/configure-github-governance.mjs", ...applyArg]);
run(process.execPath, ["scripts/bootstrap-github.mjs", `--target=${target}`, ...applyArg]);

if (!apply) {
  console.log(
    `\nNo hosted workflow was dispatched. Re-run with --apply to bootstrap, deploy, and verify ${target}.`
  );
  process.exit(0);
}

const existingRuns = new Set(listWorkflowRuns());
run("gh", ["workflow", "run", "bootstrap.yml", "--ref", "main", "-f", `target=${target}`]);
const runId = waitForNewRun(existingRuns);
console.log(`\nFollowing Bootstrap & Deploy run ${runId} for ${target}...`);
run("gh", ["run", "watch", String(runId), "--exit-status"]);

function readOption(name) {
  const inline = args.find((arg) => arg.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : "";
}

function listWorkflowRuns() {
  const output = capture("gh", [
    "run",
    "list",
    "--workflow",
    "bootstrap.yml",
    "--branch",
    "main",
    "--event",
    "workflow_dispatch",
    "--limit",
    "20",
    "--json",
    "databaseId",
    "--jq",
    ".[] | .databaseId",
  ]);
  return output.split(/\s+/).map(Number).filter(Number.isFinite);
}

function waitForNewRun(existingRuns) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const runId = listWorkflowRuns().find((id) => !existingRuns.has(id));
    if (runId) return runId;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 2000);
  }
  fail(
    "The workflow was dispatched, but its run could not be identified. Inspect GitHub Actions for Bootstrap & Deploy."
  );
}

function capture(command, commandArgs) {
  const result = spawnSync(command, commandArgs, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.error || result.status !== 0) {
    fail(`${command} ${commandArgs.join(" ")} failed: ${result.stderr || result.error?.message}`);
  }
  return result.stdout.trim();
}

function run(command, commandArgs) {
  const result = spawnSync(command, commandArgs, { encoding: "utf8", stdio: "inherit" });
  if (result.error || result.status !== 0) {
    fail(`${command} ${commandArgs.join(" ")} failed with exit code ${result.status ?? "unknown"}`);
  }
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
