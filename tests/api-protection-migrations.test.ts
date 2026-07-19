import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const rateLimitMigration = new URL(
  "../supabase/migrations/20260719060000_api_rate_limits.sql",
  import.meta.url
);
const idempotencyMigration = new URL(
  "../supabase/migrations/20260719061000_api_idempotency.sql",
  import.meta.url
);

describe("API protection database migrations", () => {
  it("keeps durable rate-limit state private and atomic", async () => {
    const source = await readFile(rateLimitMigration, "utf8");

    expect(source).toContain("create table if not exists public.api_rate_limit_buckets");
    expect(source).toContain("enable row level security");
    expect(source).toContain(
      "revoke all on table public.api_rate_limit_buckets from public, anon, authenticated"
    );
    expect(source).toContain("to service_role");
    expect(source).toContain("create or replace function public.consume_api_rate_limit");
    expect(source).toContain("on conflict (bucket_key) do update");
    expect(source).toContain("security definer");
  });

  it("stores idempotency claims without exposing raw keys", async () => {
    const source = await readFile(idempotencyMigration, "utf8");

    expect(source).toContain("create table if not exists public.api_idempotency_records");
    expect(source).toContain("idempotency_key_hash text not null");
    expect(source).not.toMatch(/\bidempotency_key\s+text\b/);
    expect(source).toContain("unique (scope, actor_id, idempotency_key_hash)");
    expect(source).toContain("enable row level security");
    expect(source).toContain(
      "revoke all on table public.api_idempotency_records from public, anon, authenticated"
    );
  });

  it("supports claim, replay, completion, and safe release semantics", async () => {
    const source = await readFile(idempotencyMigration, "utf8");

    expect(source).toContain("create or replace function public.claim_api_idempotency");
    expect(source).toContain("claim_state := 'claimed'");
    expect(source).toContain("claim_state := 'replay'");
    expect(source).toContain("claim_state := 'conflict'");
    expect(source).toContain("claim_state := 'in_progress'");
    expect(source).toContain("create or replace function public.complete_api_idempotency");
    expect(source).toContain("create or replace function public.release_api_idempotency");
    expect(source).toContain("from public, anon, authenticated");
    expect(source).toContain("to service_role");
  });
});
