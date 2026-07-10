#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isMissingStateAddress } from "./lib/terraform-state.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");
const terraformDir = resolve(repoRoot, "infra/terraform/platform");
const supabaseEnvironments = (optional("TERRAFORM_BOOTSTRAP_SUPABASE_ENVIRONMENTS") || "development,production")
  .split(",").map((env) => env.trim()).filter(Boolean);

await bootstrapVercelProject();
await bootstrapSupabaseProjects();

function optional(key) { return process.env[key]?.trim() || ""; }
function firstPresent(...keys) {
  for (const key of keys) {
    const value = optional(key);
    if (value) return value;
  }
  return "";
}

function readState(address) {
  const result = spawnSync("terraform", ["state", "show", "-no-color", address], {
    cwd: terraformDir,
    env: process.env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.error) fail(`Terraform failed to read state for ${address}: ${result.error.message}`);
  const output = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
  if (result.status !== 0) {
    if (isMissingStateAddress(output)) return { exists: false, id: "" };
    fail(`Could not inspect Terraform state for ${address}:\n${output}`);
  }
  return { exists: true, id: terraformStateId(result.stdout) };
}

function terraformStateId(state) {
  const match = state.match(/^\s*id\s*=\s*"([^"]+)"\s*$/m);
  return match?.[1] || "";
}

function terraform(args) {
  const result = spawnSync("terraform", args, { cwd: terraformDir, env: process.env, stdio: "inherit" });
  if (result.error) fail(`Terraform failed to start: ${result.error.message}`);
  if (result.status !== 0) process.exit(result.status ?? 1);
}

async function bootstrapVercelProject() {
  const address = "vercel_project.app";
  if (readState(address).exists) {
    console.log(`${address} is already in Terraform state; skipping Vercel import.`);
    return;
  }
  const token = firstPresent("VERCEL_API_TOKEN", "VERCEL_TOKEN");
  if (!token) fail("VERCEL_TOKEN is required to reconcile the Vercel Terraform state.");
  const projectName = firstPresent("TF_VAR_vercel_project_name", "VERCEL_PROJECT_NAME") || firstPresent("TF_VAR_project_slug", "PROJECT_SLUG");
  if (!projectName) fail("Project slug/name is required to reconcile the Vercel Terraform state.");
  const teamId = firstPresent("TF_VAR_vercel_team_id", "VERCEL_TEAM_ID");
  const url = new URL(`https://api.vercel.com/v9/projects/${encodeURIComponent(projectName)}`);
  if (teamId) url.searchParams.set("teamId", teamId);
  const project = await fetchJson(url, { Authorization: `Bearer ${token}` }, { optional404: true });
  if (!project) {
    console.log(`No existing Vercel project named ${projectName} was found; Terraform may create it.`);
    return;
  }
  const projectId = project.id || project.projectId;
  if (!projectId) fail(`Vercel project ${projectName} response did not include an id.`);
  console.log(`Importing existing Vercel project ${projectName} (${projectId}) into Terraform state.`);
  terraform(["import", "-input=false", address, projectId]);
}

async function bootstrapSupabaseProjects() {
  const token = optional("SUPABASE_ACCESS_TOKEN");
  if (!token) fail("SUPABASE_ACCESS_TOKEN is required to reconcile Supabase Terraform state.");
  const projectSlug = firstPresent("TF_VAR_project_slug", "PROJECT_SLUG");
  if (!projectSlug) fail("Project slug is required to reconcile Supabase Terraform state.");
  const organizationId = firstPresent("TF_VAR_supabase_organization_id", "SUPABASE_ORGANIZATION_ID");
  const projects = await fetchJson("https://api.supabase.com/v1/projects", { Authorization: `Bearer ${token}` });
  if (!Array.isArray(projects)) fail("Unexpected Supabase projects response.");
  console.log(`Supabase state reconciliation can see ${projects.length} project(s): ${visibleSupabaseProjectNames(projects)}`);
  const visibleProjectRefs = new Set(projects.map(supabaseProjectRef).filter(Boolean));

  for (const env of supabaseEnvironments) {
    const address = `supabase_project.app["${env}"]`;
    const state = readState(address);
    if (state.exists) {
      if (!state.id) fail(`${address} is in Terraform state but its project ref could not be read.`);
      if (visibleProjectRefs.has(state.id)) {
        console.log(`${address} (${state.id}) still exists in Supabase; skipping import.`);
        continue;
      }
      console.log(`${address} points to deleted Supabase project ${state.id}; removing only the stale state entry.`);
      terraform(["state", "rm", address]);
    }

    const projectNames = supabaseProjectNameCandidates(projectSlug, env);
    const project = selectSupabaseProject(projects, projectNames, organizationId, env);
    if (!project) {
      console.log(`No existing Supabase project for ${env} matched ${projectNames.join(", ")}; Terraform may create it.`);
      continue;
    }
    const projectRef = supabaseProjectRef(project);
    if (!projectRef) fail(`Supabase project ${supabaseProjectDisplayName(project)} response did not include an id/ref.`);
    console.log(`Importing existing Supabase project ${supabaseProjectDisplayName(project)} (${projectRef}) into Terraform state.`);
    terraform(["import", "-input=false", address, projectRef]);
  }
}

function selectSupabaseProject(projects, projectNames, organizationId, env) {
  const matches = projects.filter((candidate) => projectNames.includes(supabaseProjectDisplayName(candidate)));
  if (matches.length === 0) return null;
  const orgMatches = matches.filter((candidate) => belongsToOrganization(candidate, organizationId));
  if (orgMatches.length === 1) return orgMatches[0];
  if (orgMatches.length > 1) fail(`Multiple Supabase projects for ${env} matched ${projectNames.join(", ")} in the configured organization. Set SUPABASE_${env.toUpperCase()}_PROJECT_NAME to disambiguate.`);
  if (matches.length === 1) {
    console.log(`Supabase project ${supabaseProjectDisplayName(matches[0])} matched by name despite missing/different organization metadata.`);
    return matches[0];
  }
  fail(`Multiple Supabase projects for ${env} matched ${projectNames.join(", ")}, but none matched the configured organization metadata.`);
}
function supabaseProjectNameCandidates(projectSlug, env) {
  return unique([
    firstPresent(`SUPABASE_${env.toUpperCase()}_PROJECT_NAME`, `SUPABASE_PROJECT_NAME_${env.toUpperCase()}`),
    env === "production" ? projectSlug : "",
    env === "development" ? `${projectSlug}-dev` : "",
    `${projectSlug}-${env}`,
  ]);
}
function supabaseProjectRef(project) { return String(project.id || project.ref || ""); }
function supabaseProjectDisplayName(project) { return String(project.name || project.project_name || project.projectName || project.slug || ""); }
function visibleSupabaseProjectNames(projects) {
  if (projects.length === 0) return "none";
  const names = projects.map(supabaseProjectDisplayName).filter(Boolean);
  return names.length > 0 ? names.join(", ") : "none with a name field";
}
function unique(values) { return [...new Set(values.filter(Boolean))]; }
function belongsToOrganization(project, organizationId) {
  if (!organizationId) return true;
  const candidates = [project.organization_id, project.organizationId, project.organization?.id, project.organization?.slug]
    .filter(Boolean).map(String);
  return candidates.length > 0 && candidates.includes(organizationId);
}
async function fetchJson(url, headers, options = {}) {
  const response = await fetch(url, { headers });
  if (response.status === 404 && options.optional404) return null;
  if (!response.ok) fail(`Request to ${url} failed with HTTP ${response.status}: ${await response.text()}`);
  return response.json();
}
function fail(message) { console.error(message); process.exit(1); }
