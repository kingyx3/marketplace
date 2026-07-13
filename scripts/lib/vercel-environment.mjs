import { readFile } from "node:fs/promises";

export function parseVercelEnvironmentList(output) {
  const text = String(output || "").trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < start) {
    throw new Error("Vercel environment response did not return JSON.");
  }

  let parsed;
  try {
    parsed = JSON.parse(text.slice(start, end + 1));
  } catch {
    throw new Error("Vercel environment response returned malformed JSON.");
  }
  if (!Array.isArray(parsed.envs)) {
    throw new Error("Vercel environment response did not contain an envs array.");
  }
  return parsed.envs.filter((record) => record && typeof record.key === "string");
}

export function vercelEnvironmentRecordTargets(record) {
  const targets = Array.isArray(record?.target)
    ? record.target
    : typeof record?.target === "string"
      ? [record.target]
      : [];
  return [...targets, ...(Array.isArray(record?.customEnvironmentIds) ? record.customEnvironmentIds : [])];
}

export function genericVercelEnvironmentRecords(records, target) {
  const byKey = new Map();
  for (const record of records) {
    if (record.gitBranch) continue;
    if (target && !vercelEnvironmentRecordTargets(record).includes(target)) continue;
    if (byKey.has(record.key)) {
      throw new Error(`Multiple unscoped Vercel environment records found for ${record.key}.`);
    }
    byKey.set(record.key, record);
  }
  return byKey;
}

export function isUnreadableVercelEnvironmentRecord(record) {
  if (!record) return false;
  if (record.type === "sensitive") return true;
  return record.decrypted === false || record.decrypted === "false";
}

export function readableVercelEnvironmentValue(record) {
  if (!record || isUnreadableVercelEnvironmentRecord(record)) return undefined;
  return typeof record.value === "string" ? record.value : undefined;
}

export function isTargetExclusiveVercelEnvironmentRecord(record, target) {
  const targets = vercelEnvironmentRecordTargets(record);
  return !record?.gitBranch && targets.length === 1 && targets[0] === target;
}

export async function resolveVercelProjectContext(env = process.env, options = {}) {
  const projectPath = options.projectPath || ".vercel/project.json";
  let linked = {};
  try {
    linked = JSON.parse(await readFile(projectPath, "utf8"));
  } catch (error) {
    if (error?.code !== "ENOENT") throw new Error(`Could not read ${projectPath}: ${error.message}`);
  }

  const token = env.VERCEL_TOKEN || env.VERCEL_API_TOKEN || "";
  const projectId = env.VERCEL_PROJECT_ID || linked.projectId || "";
  const teamId = env.VERCEL_TEAM_ID || env.VERCEL_ORG_ID || linked.orgId || "";
  if (!token) throw new Error("VERCEL_TOKEN is required");
  if (!projectId) throw new Error("VERCEL_PROJECT_ID or .vercel/project.json is required");
  return { token, projectId, teamId };
}

export async function fetchVercelEnvironmentRecords({
  token,
  projectId,
  teamId = "",
  target,
  decrypt = true,
  fetchImpl = fetch,
}) {
  const url = vercelApiUrl(`/v10/projects/${encodeURIComponent(projectId)}/env`, teamId);
  if (target) url.searchParams.set("target", target);
  if (decrypt) url.searchParams.set("decrypt", "true");
  const payload = await vercelApiRequest(url, { token, fetchImpl });
  if (!Array.isArray(payload?.envs)) throw new Error("Vercel environment API response did not contain an envs array.");
  return payload.envs.filter((record) => record && typeof record.key === "string");
}

export async function createVercelEnvironmentRecord({
  token,
  projectId,
  teamId = "",
  key,
  value,
  target,
  type = "encrypted",
  fetchImpl = fetch,
}) {
  const url = vercelApiUrl(`/v10/projects/${encodeURIComponent(projectId)}/env`, teamId);
  return vercelApiRequest(url, {
    token,
    fetchImpl,
    method: "POST",
    body: { key, value, type, target: [target] },
  });
}

export async function updateVercelEnvironmentRecord({
  token,
  projectId,
  teamId = "",
  record,
  value,
  target,
  fetchImpl = fetch,
}) {
  if (!record?.id) throw new Error(`Vercel environment record ${record?.key || "<unknown>"} has no id.`);
  if (!isTargetExclusiveVercelEnvironmentRecord(record, target)) {
    throw new Error(
      `Refusing to update shared Vercel environment record ${record.key}; split it into one record per target first.`
    );
  }
  const url = vercelApiUrl(
    `/v9/projects/${encodeURIComponent(projectId)}/env/${encodeURIComponent(record.id)}`,
    teamId
  );
  const body = {
    type: record.type || "encrypted",
    value,
    target: [target],
    gitBranch: undefined,
    ...(record.type === "sensitive" ? {} : { key: record.key }),
  };
  return vercelApiRequest(url, { token, fetchImpl, method: "PATCH", body });
}

export async function deleteVercelEnvironmentRecord({
  token,
  projectId,
  teamId = "",
  record,
  target,
  fetchImpl = fetch,
}) {
  if (!record?.id) throw new Error(`Vercel environment record ${record?.key || "<unknown>"} has no id.`);
  if (!isTargetExclusiveVercelEnvironmentRecord(record, target)) {
    throw new Error(
      `Refusing to remove shared Vercel environment record ${record.key}; split it into one record per target first.`
    );
  }
  const url = vercelApiUrl(
    `/v10/projects/${encodeURIComponent(projectId)}/env/${encodeURIComponent(record.id)}`,
    teamId
  );
  return vercelApiRequest(url, { token, fetchImpl, method: "DELETE" });
}

export function buildEnvironmentWithVercelFallback({ records, runtimeKeys, baseEnv, target }) {
  const remote = {};
  const byKey = genericVercelEnvironmentRecords(records, target);
  for (const key of runtimeKeys) {
    const record = byKey.get(key);
    const value = readableVercelEnvironmentValue(record);
    if (value !== undefined) remote[key] = value;
  }
  return {
    ...remote,
    ...withoutEmptyValues(baseEnv),
    MARKETPLACE_DISABLE_LOCAL_DOTENV: "true",
  };
}

function vercelApiUrl(path, teamId) {
  const url = new URL(path, "https://api.vercel.com");
  if (teamId && String(teamId).startsWith("team_")) url.searchParams.set("teamId", teamId);
  return url;
}

async function vercelApiRequest(url, { token, fetchImpl, method = "GET", body }) {
  const response = await fetchImpl(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  let payload = {};
  if (text.trim()) {
    try {
      payload = JSON.parse(text);
    } catch {
      if (response.ok) throw new Error("Vercel API returned malformed JSON.");
    }
  }
  if (!response.ok) {
    const message = payload?.error?.message || payload?.message || response.statusText || "request failed";
    throw new Error(`Vercel API ${method} ${url.pathname} failed (${response.status}): ${message}`);
  }
  return payload;
}

function withoutEmptyValues(env) {
  return Object.fromEntries(
    Object.entries(env || {})
      .filter(([, value]) => value !== undefined && value !== null && String(value).trim() !== "")
      .map(([key, value]) => [key, String(value)])
  );
}
