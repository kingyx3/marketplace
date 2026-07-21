#!/usr/bin/env node

const accessToken = required("SUPABASE_ACCESS_TOKEN");
const projectRef = required("SUPABASE_PROJECT_REF");
const requiredBackupMode = (process.env.SUPABASE_REQUIRED_BACKUP_MODE || "pitr")
  .trim()
  .toLowerCase();
const minimumRetentionDays = positiveInteger("SUPABASE_MINIMUM_BACKUP_RETENTION_DAYS", 7);
const advisorAllowlist = new Set(
  String(process.env.SUPABASE_ADVISOR_ALLOWLIST || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
);

if (!new Set(["pitr", "daily"]).has(requiredBackupMode)) {
  throw new Error("SUPABASE_REQUIRED_BACKUP_MODE must be pitr or daily");
}

const [backups, securityAdvisors, performanceAdvisors] = await Promise.all([
  managementJson(`/v1/projects/${projectRef}/database/backups`, "Supabase backups"),
  managementJson(`/v1/projects/${projectRef}/advisors/security`, "Supabase security advisors"),
  managementJson(
    `/v1/projects/${projectRef}/advisors/performance`,
    "Supabase performance advisors"
  ),
]);

const backupEvidence = verifyBackups(backups);
verifyAdvisors(securityAdvisors, "security", true);
verifyAdvisors(performanceAdvisors, "performance", false);

console.log(
  JSON.stringify(
    {
      projectRef,
      backupMode: backupEvidence.mode,
      earliestRecoveryPoint: backupEvidence.earliestRecoveryPoint,
      latestRecoveryPoint: backupEvidence.latestRecoveryPoint,
      retentionDays: backupEvidence.retentionDays,
      recoverableBackups: backupEvidence.recoverableBackups,
      securityAdvisors: "passed",
      performanceAdvisors: "reviewed",
    },
    null,
    2
  )
);

function verifyBackups(payload) {
  const entries = collectEntries(payload);
  const pitrEnabled = entries.some(([key, value]) => {
    if (!/pitr|point.?in.?time|walg/i.test(key)) return false;
    return value === true || ["true", "enabled", "active"].includes(String(value).toLowerCase());
  });
  const recoveryTimes = entries
    .filter(
      ([key, value]) =>
        /recovery|restore.*point|earliest|latest|start.*time|end.*time/i.test(key) &&
        isDateLike(value)
    )
    .map(([, value]) => new Date(value));
  const recoverableBackups = collectObjects(payload).filter((object) => {
    const status = String(object.status || object.state || "").toLowerCase();
    const type = String(object.type || object.backup_type || object.kind || "").toLowerCase();
    const hasTimestamp = [
      object.created_at,
      object.inserted_at,
      object.completed_at,
      object.timestamp,
      object.started_at,
    ].some(isDateLike);
    return (
      (!status || ["completed", "succeeded", "success", "available", "ready"].includes(status)) &&
      (type.includes("daily") ||
        type.includes("physical") ||
        type.includes("scheduled") ||
        type.includes("pitr") ||
        hasTimestamp)
    );
  });

  const sortedRecoveryTimes = uniqueTimes(recoveryTimes).sort((a, b) => a.getTime() - b.getTime());
  const earliestRecoveryPoint = sortedRecoveryTimes.at(0)?.toISOString() ?? null;
  const latestRecoveryPoint = sortedRecoveryTimes.at(-1)?.toISOString() ?? null;
  const retentionDays =
    sortedRecoveryTimes.length >= 2
      ? (sortedRecoveryTimes.at(-1).getTime() - sortedRecoveryTimes.at(0).getTime()) / 86_400_000
      : estimateDailyRetention(recoverableBackups);

  if (requiredBackupMode === "pitr") {
    if (!pitrEnabled && sortedRecoveryTimes.length < 2) {
      throw new Error(
        "Supabase PITR evidence was not found. Enable the PITR add-on and expose an earliest/latest recovery window before production release."
      );
    }
  } else if (recoverableBackups.length === 0 && sortedRecoveryTimes.length === 0) {
    throw new Error("No recoverable Supabase backup was found");
  }

  if (!Number.isFinite(retentionDays) || retentionDays < minimumRetentionDays - 0.1) {
    throw new Error(
      `Supabase backup retention is ${
        Number.isFinite(retentionDays) ? retentionDays.toFixed(2) : "unknown"
      } days; ${minimumRetentionDays} days are required`
    );
  }

  return {
    mode: pitrEnabled || sortedRecoveryTimes.length >= 2 ? "pitr" : "daily",
    earliestRecoveryPoint,
    latestRecoveryPoint,
    retentionDays: Number(retentionDays.toFixed(2)),
    recoverableBackups: recoverableBackups.length,
  };
}

function verifyAdvisors(payload, kind, failWarnings) {
  const findings = collectObjects(payload).filter(
    (object) =>
      object &&
      (object.code || object.name || object.title) &&
      (object.level || object.severity || object.category)
  );
  const blocking = findings.filter((finding) => {
    const code = String(finding.code || finding.name || finding.title || "");
    if (advisorAllowlist.has(code)) return false;
    const severity = String(
      finding.level || finding.severity || finding.category || ""
    ).toLowerCase();
    if (["error", "critical", "high"].includes(severity)) return true;
    return failWarnings && ["warn", "warning", "medium"].includes(severity);
  });

  if (blocking.length > 0) {
    const summary = blocking
      .slice(0, 20)
      .map(
        (finding) =>
          `${finding.code || finding.name || finding.title}: ${finding.level || finding.severity}`
      )
      .join("; ");
    throw new Error(`Blocking Supabase ${kind} advisor findings: ${summary}`);
  }
}

function estimateDailyRetention(backups) {
  const timestamps = backups
    .flatMap((backup) => [
      backup.created_at,
      backup.inserted_at,
      backup.completed_at,
      backup.timestamp,
      backup.started_at,
    ])
    .filter(isDateLike)
    .map((value) => new Date(value).getTime())
    .sort((a, b) => a - b);
  if (timestamps.length < 2) return timestamps.length;
  return (timestamps.at(-1) - timestamps.at(0)) / 86_400_000 + 1;
}

async function managementJson(path, service) {
  const response = await fetch(`https://api.supabase.com${path}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${service} lookup failed (${response.status}): ${redact(text)}`);
  }
  return response.json();
}

function collectEntries(value, prefix = "", output = []) {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => collectEntries(entry, `${prefix}[${index}]`, output));
  } else if (value && typeof value === "object") {
    for (const [key, entry] of Object.entries(value)) {
      const path = prefix ? `${prefix}.${key}` : key;
      output.push([path, entry]);
      collectEntries(entry, path, output);
    }
  }
  return output;
}

function collectObjects(value, output = []) {
  if (Array.isArray(value)) value.forEach((entry) => collectObjects(entry, output));
  else if (value && typeof value === "object") {
    output.push(value);
    Object.values(value).forEach((entry) => collectObjects(entry, output));
  }
  return output;
}

function uniqueTimes(values) {
  return [...new Map(values.map((value) => [value.getTime(), value])).values()];
}
function isDateLike(value) {
  return (
    (typeof value === "string" || typeof value === "number") &&
    Number.isFinite(new Date(value).getTime())
  );
}
function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}
function positiveInteger(name, fallback) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
}
function redact(value) {
  return String(value)
    .replaceAll(accessToken, "[redacted]")
    .replace(/[A-Za-z0-9_-]{30,}/g, "[redacted]")
    .slice(0, 500);
}
