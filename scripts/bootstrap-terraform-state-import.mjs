#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const address = "google_storage_bucket.terraform_state";
const bucketName = process.env.TF_VAR_state_bucket_name || process.env.TF_STATE_BUCKET_NAME;
const scriptDir = dirname(fileURLToPath(import.meta.url));
const terraformDir = resolve(scriptDir, "../infra/terraform/bootstrap");

if (!bucketName) fail("TF_VAR_state_bucket_name or TF_STATE_BUCKET_NAME is required");

const state = terraform(["state", "show", "-no-color", address]);
if (state.status === 0) {
  console.log(`${address} is already managed in Terraform state; skipping import.`);
  process.exit(0);
}
if (!isMissingStateAddress(state.output)) {
  fail(`Could not inspect Terraform state for ${address}:\n${state.output}`);
}

const imported = terraform(["import", "-input=false", address, bucketName]);
if (imported.status === 0) {
  console.log(`Imported existing state bucket ${bucketName}.`);
  process.exit(0);
}
if (isMissingRemoteObject(imported.output)) {
  console.log(`State bucket ${bucketName} does not exist yet; Terraform may create it.`);
  process.exit(0);
}

fail(`Terraform state bucket import failed:\n${imported.output}`);

function terraform(args) {
  const result = spawnSync("terraform", args, {
    cwd: terraformDir,
    env: process.env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.error) fail(`Terraform failed to start: ${result.error.message}`);
  return {
    status: result.status ?? 1,
    output: [result.stdout, result.stderr].filter(Boolean).join("\n").trim(),
  };
}

function isMissingStateAddress(output) {
  // A brand-new backend has no snapshot yet. Treat that exactly like an absent
  // resource address so the import/create reconciliation can proceed.
  return /no instance found|does not exist in the state|invalid address to set|no state file was found/i.test(
    output
  );
}

function isMissingRemoteObject(output) {
  return /cannot import non-existent remote object|remote object does not exist|not found/i.test(output);
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
