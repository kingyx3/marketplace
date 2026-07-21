#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";

const CONTRACT_URL = new URL("../config/environment-contract.json", import.meta.url);
const OUTPUTS = [
  [new URL("../.env.example", import.meta.url), renderEnvExample],
  [new URL("../lib/env-contract.generated.ts", import.meta.url), renderTypeScriptSchema],
  [new URL("../docs/generated/environment-reference.md", import.meta.url), renderReference],
];

const mode = process.argv[2] || "--check";
if (!["--check", "--write"].includes(mode))
  fail("usage: generate-environment-artifacts.mjs --check|--write");
const contract = JSON.parse(await readFile(CONTRACT_URL, "utf8"));
let changed = false;

for (const [url, render] of OUTPUTS) {
  const expected = render(contract);
  if (mode === "--write") {
    await writeFile(url, expected, "utf8");
    console.log(`wrote ${fileLabel(url)}`);
    continue;
  }

  let actual = "";
  try {
    actual = await readFile(url, "utf8");
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  if (actual !== expected) {
    changed = true;
    console.error(`${fileLabel(url)} is out of date; run npm run env:artifacts:write`);
  }
}

if (changed) process.exit(1);
if (mode === "--check") console.log("generated environment artifacts are current");

function renderEnvExample(entries) {
  const lines = [
    "# Generated from config/environment-contract.json by scripts/generate-environment-artifacts.mjs.",
    "# Never place real secrets in this committed file.",
    "# Hosted CI resolves Terraform/provider values and generates temporary runtime configuration.",
    "",
  ];
  let section = "";
  for (const entry of entries) {
    if (entry.section !== section) {
      section = entry.section;
      lines.push(`# ---------- ${section} ----------`);
    }
    const requirement = entry.required || entry.requiredWhen ? "required" : "optional";
    const visibility = entry.secret ? "SECRET" : "public";
    const conditional = entry.requiredWhen
      ? ` when ${entry.requiredWhen.key}=${entry.requiredWhen.equals}`
      : "";
    const deployOnly = entry.deployOnly ? "; deploy-time only" : "";
    lines.push(`# [${requirement}${conditional}] [${visibility}${deployOnly}] ${entry.hint}`);
    lines.push(`${entry.key}=${entry.default ?? entry.example ?? ""}`);
  }
  return `${lines.join("\n")}\n`;
}

function renderTypeScriptSchema(entries) {
  const runtimeEntries = entries.filter((entry) => !entry.deployOnly);
  const lines = [
    "// Generated from config/environment-contract.json. Do not edit directly.",
    'import { z } from "zod";',
    "",
    "export const serverEnvSchema = z.object({",
  ];
  for (const entry of runtimeEntries) {
    lines.push(`  ${entry.key}: ${zodExpression(entry)},`);
  }
  lines.push("});", "", "export type ServerEnv = z.infer<typeof serverEnvSchema>;", "");
  return lines.join("\n");
}

function zodExpression(entry) {
  const validator = entry.validator || { type: "nonempty" };
  let expression = "z.string()";
  if (validator.type === "url") expression += ".url()";
  else if (validator.type === "email") expression += ".email()";
  else if (validator.type === "prefix")
    expression += `.startsWith(${JSON.stringify(validator.value)})`;
  else if (validator.type === "enum") expression = `z.enum(${JSON.stringify(validator.values)})`;
  else if (validator.type === "boolean-string") expression = 'z.enum(["true", "false"])';
  else if (validator.type === "pattern")
    expression += `.regex(new RegExp(${JSON.stringify(validator.value)}))`;
  else expression += ".min(1)";
  if (!entry.required) expression += ".optional()";
  return expression;
}

function renderReference(entries) {
  const lines = [
    "# Generated environment reference",
    "",
    "This file is generated from `config/environment-contract.json`. Update the contract and run `npm run env:artifacts:write`.",
    "",
    "| Key | Scope | Required | Secret | Source / purpose |",
    "| --- | --- | --- | --- | --- |",
  ];
  for (const entry of entries) {
    const required = entry.requiredWhen
      ? `When \`${entry.requiredWhen.key}=${entry.requiredWhen.equals}\``
      : entry.required
        ? "Yes"
        : "No";
    lines.push(
      `| \`${entry.key}\` | ${entry.deployOnly ? "Deploy" : "Runtime"} | ${required} | ${entry.secret ? "Yes" : "No"} | ${escapePipe(entry.hint)} |`
    );
  }
  lines.push("");
  return lines.join("\n");
}

function escapePipe(value) {
  return String(value).replaceAll("|", "\\|");
}

function fileLabel(url) {
  return url.pathname.split("/").slice(-3).join("/");
}

function fail(message) {
  console.error(message);
  process.exit(2);
}
