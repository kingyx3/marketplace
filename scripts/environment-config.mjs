#!/usr/bin/env node
import { appendFile, readFile } from "node:fs/promises";
import { inspect } from "node:util";

const CONFIG_URL = new URL("../config/environments.json", import.meta.url);
const ENV_KEY = /^[A-Z][A-Z0-9_]*$/;

export async function loadEnvironmentConfig(targetEnv = process.env.TARGET_ENV) {
  const raw = await readFile(CONFIG_URL, "utf8");
  const config = JSON.parse(raw);
  const shared = pickEnvKeys(config.shared || {});
  const environment = targetEnv ? pickEnvKeys(config.environments?.[targetEnv] || {}) : {};
  return { ...shared, ...environment };
}

export async function applyVersionedEnvironmentConfig(env = process.env, options = {}) {
  const targetEnv = options.targetEnv ?? env.TARGET_ENV;
  const values = await loadEnvironmentConfig(targetEnv);
  const applied = [];

  for (const [key, rawValue] of Object.entries(values)) {
    const value = normalizeValue(rawValue);
    if (!value) continue;
    if (hasValue(env[key]) && !options.override) continue;
    env[key] = value;
    applied.push(key);
  }

  return applied;
}

export async function exportPublicEnvironmentForGithubActions(env = process.env, contract = []) {
  if (!env.GITHUB_ENV) return [];
  const keys = contract
    .filter((entry) => !entry.secret && hasValue(env[entry.key]))
    .map((entry) => entry.key);

  if (keys.length === 0) return [];

  const lines = keys.map((key) => formatGithubEnvLine(key, env[key])).join("");
  await appendFile(env.GITHUB_ENV, lines, "utf8");
  return keys;
}

export function normalizeValue(value) {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean).join(",");
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function pickEnvKeys(values) {
  return Object.fromEntries(
    Object.entries(values).filter(([key]) => ENV_KEY.test(key))
  );
}

function hasValue(value) {
  return value !== undefined && value !== null && String(value).trim() !== "";
}

function formatGithubEnvLine(key, value) {
  const stringValue = String(value);
  if (!stringValue.includes("\n")) return `${key}=${stringValue}\n`;

  const delimiter = `EOF_${key}_${Date.now()}`;
  return `${key}<<${delimiter}\n${stringValue}\n${delimiter}\n`;
}

async function main() {
  const targetEnv = process.argv[2] || process.env.TARGET_ENV;
  if (!targetEnv) {
    console.error("usage: node scripts/environment-config.mjs <development|production>");
    process.exit(2);
  }

  const values = await loadEnvironmentConfig(targetEnv);
  console.log(inspect(values, { colors: false, depth: null }));
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
