import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const REQUIRED_CONFIG_MARKERS = [
  "[api]",
  'schemas = ["public", "graphql_public"]',
  "[auth]",
  'site_url = "http://localhost:3000"',
  "additional_redirect_urls",
  "[auth.external.google]",
  "SUPABASE_AUTH_GOOGLE_CLIENT_ID",
  "SUPABASE_AUTH_GOOGLE_CLIENT_SECRET",
  "[storage]",
  "enabled = true",
  'file_size_limit = "50MiB"',
];

const REQUIRED_STORAGE_MIGRATION_MARKERS = [
  "insert into storage.buckets",
  "'product-images'",
  "allowed_mime_types",
  "grant select on table storage.buckets to anon, authenticated, service_role",
  "grant select on table storage.objects to anon, authenticated, service_role",
  "grant insert, update, delete on table storage.objects to authenticated, service_role",
  "product images are publicly readable",
  "staff can upload product images",
  "staff can update product images",
  "staff can delete product images",
  "public.current_user_is_staff",
  "grant execute on function public.current_user_is_staff() to authenticated, service_role",
  "create table if not exists public.listing_items",
  "create table if not exists public.storefront_configurations",
  "admin_upsert_listing_item",
  "admin_upsert_storefront_configuration",
  "published listing items readable",
  "active storefront configurations readable",
];

async function main() {
  const errors = [];
  const config = await readText("supabase/config.toml", errors);
  const migrations = await readMigrations(errors);

  for (const marker of REQUIRED_CONFIG_MARKERS) {
    if (!config.includes(marker)) {
      errors.push(`supabase/config.toml missing marker: ${marker}`);
    }
  }

  for (const marker of REQUIRED_STORAGE_MIGRATION_MARKERS) {
    if (!migrations.includes(marker)) {
      errors.push(`migrations missing storage marker: ${marker}`);
    }
  }

  for (const table of publicTablesFromMigrations(migrations)) {
    if (!hasRlsEnablement(migrations, table)) {
      errors.push(`public table ${table} is missing RLS enablement`);
    }
  }

  if (errors.length > 0) {
    console.error("Supabase config validation FAILED:");
    for (const error of errors) console.error(`  - ${error}`);
    process.exit(1);
  }

  console.log("Supabase config validation OK");
}

async function readText(path, errors) {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    errors.push(`${path} is missing: ${error.message}`);
    return "";
  }
}

async function readMigrations(errors) {
  try {
    const dir = "supabase/migrations";
    const files = (await readdir(dir)).filter((file) => file.endsWith(".sql")).sort();
    const contents = await Promise.all(files.map((file) => readFile(join(dir, file), "utf8")));
    return contents.join("\n");
  } catch (error) {
    errors.push(`supabase/migrations cannot be read: ${error.message}`);
    return "";
  }
}

function publicTablesFromMigrations(sql) {
  return [
    ...new Set(
      [...sql.matchAll(/create table (?:if not exists )?public\.([a-z0-9_]+)/gi)].map(
        (match) => match[1]
      )
    ),
  ].sort();
}

function hasRlsEnablement(sql, table) {
  const explicit = new RegExp(`alter\\s+table\\s+public\\.${table}\\s+enable\\s+row\\s+level\\s+security`, "i");
  if (explicit.test(sql)) return true;

  const quoted = new RegExp(`['"]${table}['"]`, "i");
  const loopEnablement =
    /foreach\s+\w+\s+in\s+array\s+array\[[\s\S]+?alter table public\.%I enable row level security/i;
  return loopEnablement.test(sql) && quoted.test(sql);
}

await main();
