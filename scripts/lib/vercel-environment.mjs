export function parseVercelEnvironmentList(output) {
  const text = String(output || "").trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < start) {
    throw new Error("Vercel env ls did not return JSON.");
  }

  let parsed;
  try {
    parsed = JSON.parse(text.slice(start, end + 1));
  } catch {
    throw new Error("Vercel env ls returned malformed JSON.");
  }
  if (!Array.isArray(parsed.envs)) {
    throw new Error("Vercel env ls JSON did not contain an envs array.");
  }
  return parsed.envs.filter((record) => record && typeof record.key === "string");
}

export function genericVercelEnvironmentRecords(records) {
  const byKey = new Map();
  for (const record of records) {
    if (record.gitBranch) continue;
    if (byKey.has(record.key)) {
      throw new Error(`Multiple unscoped Vercel environment records found for ${record.key}.`);
    }
    byKey.set(record.key, record);
  }
  return byKey;
}

export function isUnreadableVercelEnvironmentRecord(record) {
  return record?.type === "sensitive";
}
