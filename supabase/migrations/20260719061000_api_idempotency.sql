create table if not exists public.api_idempotency_records (
  id uuid primary key default gen_random_uuid(),
  scope text not null,
  actor_id uuid not null,
  idempotency_key_hash text not null,
  request_hash text not null,
  status text not null check (status in ('processing', 'completed')),
  response_status integer,
  response_body jsonb,
  locked_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique (scope, actor_id, idempotency_key_hash)
);

alter table public.api_idempotency_records enable row level security;
revoke all on table public.api_idempotency_records from public, anon, authenticated;
grant select, insert, update, delete on table public.api_idempotency_records to service_role;

create index if not exists api_idempotency_records_expiry_idx
  on public.api_idempotency_records (expires_at);

create or replace function public.claim_api_idempotency(
  p_scope text,
  p_actor_id uuid,
  p_idempotency_key_hash text,
  p_request_hash text,
  p_ttl_seconds integer
)
returns table (
  claim_state text,
  stored_response_status integer,
  stored_response_body jsonb
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_record public.api_idempotency_records%rowtype;
begin
  if p_scope is null or length(p_scope) < 2 or length(p_scope) > 100 then
    raise exception 'invalid idempotency scope' using errcode = '22023';
  end if;
  if p_actor_id is null then
    raise exception 'actor is required' using errcode = '22023';
  end if;
  if p_idempotency_key_hash !~ '^[0-9a-f]{64}$' or p_request_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid idempotency hash' using errcode = '22023';
  end if;
  if p_ttl_seconds < 60 or p_ttl_seconds > 86400 then
    raise exception 'invalid idempotency ttl' using errcode = '22023';
  end if;

  insert into public.api_idempotency_records (
    scope,
    actor_id,
    idempotency_key_hash,
    request_hash,
    status,
    expires_at
  ) values (
    p_scope,
    p_actor_id,
    p_idempotency_key_hash,
    p_request_hash,
    'processing',
    v_now + make_interval(secs => p_ttl_seconds)
  )
  on conflict (scope, actor_id, idempotency_key_hash) do nothing
  returning * into v_record;

  if found then
    claim_state := 'claimed';
    stored_response_status := null;
    stored_response_body := null;
    return next;
    return;
  end if;

  select *
  into v_record
  from public.api_idempotency_records
  where scope = p_scope
    and actor_id = p_actor_id
    and idempotency_key_hash = p_idempotency_key_hash
  for update;

  if v_record.request_hash <> p_request_hash then
    claim_state := 'conflict';
    stored_response_status := null;
    stored_response_body := null;
    return next;
    return;
  end if;

  if v_record.status = 'completed' and v_record.expires_at > v_now then
    claim_state := 'replay';
    stored_response_status := v_record.response_status;
    stored_response_body := v_record.response_body;
    return next;
    return;
  end if;

  if v_record.status = 'processing'
    and v_record.expires_at > v_now
    and v_record.locked_at > v_now - interval '2 minutes' then
    claim_state := 'in_progress';
    stored_response_status := null;
    stored_response_body := null;
    return next;
    return;
  end if;

  update public.api_idempotency_records
  set
    request_hash = p_request_hash,
    status = 'processing',
    response_status = null,
    response_body = null,
    locked_at = v_now,
    expires_at = v_now + make_interval(secs => p_ttl_seconds),
    updated_at = v_now
  where id = v_record.id;

  claim_state := 'claimed';
  stored_response_status := null;
  stored_response_body := null;
  return next;
end;
$$;

create or replace function public.complete_api_idempotency(
  p_scope text,
  p_actor_id uuid,
  p_idempotency_key_hash text,
  p_request_hash text,
  p_response_status integer,
  p_response_body jsonb
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.api_idempotency_records
  set
    status = 'completed',
    response_status = p_response_status,
    response_body = p_response_body,
    updated_at = clock_timestamp()
  where scope = p_scope
    and actor_id = p_actor_id
    and idempotency_key_hash = p_idempotency_key_hash
    and request_hash = p_request_hash
    and status = 'processing';

  if not found then
    raise exception 'idempotency claim not found' using errcode = 'P0002';
  end if;
end;
$$;

create or replace function public.release_api_idempotency(
  p_scope text,
  p_actor_id uuid,
  p_idempotency_key_hash text,
  p_request_hash text
)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  delete from public.api_idempotency_records
  where scope = p_scope
    and actor_id = p_actor_id
    and idempotency_key_hash = p_idempotency_key_hash
    and request_hash = p_request_hash
    and status = 'processing';
$$;

revoke all on function public.claim_api_idempotency(text, uuid, text, text, integer)
  from public, anon, authenticated;
revoke all on function public.complete_api_idempotency(text, uuid, text, text, integer, jsonb)
  from public, anon, authenticated;
revoke all on function public.release_api_idempotency(text, uuid, text, text)
  from public, anon, authenticated;

grant execute on function public.claim_api_idempotency(text, uuid, text, text, integer)
  to service_role;
grant execute on function public.complete_api_idempotency(text, uuid, text, text, integer, jsonb)
  to service_role;
grant execute on function public.release_api_idempotency(text, uuid, text, text)
  to service_role;

comment on table public.api_idempotency_records is
  'Server-only request claims and replay payloads for duplicate-sensitive API operations.';
