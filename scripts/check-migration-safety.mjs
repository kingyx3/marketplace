import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const migrationDirectory = path.resolve("supabase/migrations");
const environment =
  argument("--environment") ?? process.env.TARGET_ENV ?? "development";
const destructiveApproval = process.env.ALLOW_DESTRUCTIVE_MIGRATIONS === "true";
const historicalBaseline = "20260722100000_remove_sku_model.sql";
const destructivePatterns = [
  /\btruncate\s+(?:table\s+)?/i,
  /\bdrop\s+table\b/i,
  /\bdrop\s+column\b/i,
  /\bdrop\s+function\b/i,
  /\balter\s+type\b[\s\S]{0,200}\brename\s+value\b/i,
  /\bdelete\s+from\b(?![\s\S]{0,100}\bwhere\b)/i,
];

const files = (await readdir(migrationDirectory))
  .filter((file) => file.endsWith(".sql"))
  .sort();
const violations = [];

for (const file of files) {
  if (file <= historicalBaseline) continue;
  const source = await readFile(path.join(migrationDirectory, file), "utf8");
  if (!destructivePatterns.some((pattern) => pattern.test(source))) continue;

  const approvedInFile = source
    .split("\n")
    .slice(0, 10)
    .some(
      (line) => line.trim() === "-- deployment-safety: destructive-approved",
    );
  if (
    environment === "production" &&
    !(approvedInFile && destructiveApproval)
  ) {
    violations.push(
      `${file}: destructive SQL requires the file approval marker and ALLOW_DESTRUCTIVE_MIGRATIONS=true`,
    );
  }
}

if (violations.length > 0) {
  console.error(
    [
      "Unsafe production migrations:",
      ...violations.map((value) => `- ${value}`),
    ].join("\n"),
  );
  process.exitCode = 1;
} else {
  console.log(`Migration safety check passed for ${environment}.`);
}

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}
