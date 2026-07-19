create table if not exists public.api_rate_limit_buckets (
  bucket_key text primary key,
  window_started_at timestamptz not null,
  request_count integer not null check (request_count >= 0),
  expires_at timestamptz not null
);

alter table public.api_rate_limit_buckets enable row level security;

revoke all on table public.api_rate_limit_buckets from public, anon, authenticated;
grant select, insert, update, delete on table public.api_rate_limit_buckets to service_role;

create or replace function public.consume_api_rate_limit(
  p_bucket_key text,
  p_limit integer,
  p_window_seconds integer
)
returns table (
  allowed boolean,
  retry_after_seconds integer,
  remaining integer
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_count integer;
  v_expires_at timestamptz;
begin
  if current_user not in ('service_role', 'postgres', 'supabase_admin') then
    raise exception 'insufficient privilege' using errcode = '42501';
  end if;

  if p_bucket_key is null or length(p_bucket_key) < 8 or length(p_bucket_key) > 200 then
    raise exception 'invalid bucket key' using errcode = '22023';
  end if;

  if p_limit < 1 or p_limit > 10000 or p_window_seconds < 1 or p_window_seconds > 86400 then
    raise exception 'invalid rate limit configuration' using errcode = '22023';
  end if;

  insert into public.api_rate_limit_buckets as buckets (
    bucket_key,
    window_started_at,
    request_count,
    expires_at
  )
  values (
    p_bucket_key,
    v_now,
    1,
    v_now + make_interval(secs => p_window_seconds)
  )
  on conflict (bucket_key) do update
  set
    window_started_at = case
      when buckets.expires_at <= v_now then v_now
      else buckets.window_started_at
    end,
    request_count = case
      when buckets.expires_at <= v_now then 1
      else buckets.request_count + 1
    end,
    expires_at = case
      when buckets.expires_at <= v_now then v_now + make_interval(secs => p_window_seconds)
      else buckets.expires_at
    end
  returning request_count, expires_at
  into v_count, v_expires_at;

  allowed := v_count <= p_limit;
  remaining := greatest(p_limit - v_count, 0);
  retry_after_seconds := case
    when allowed then 0
    else greatest(1, ceil(extract(epoch from (v_expires_at - v_now)))::integer)
  end;

  return next;
end;
$$;

revoke all on function public.consume_api_rate_limit(text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.consume_api_rate_limit(text, integer, integer)
  to service_role;

comment on table public.api_rate_limit_buckets is
  'Server-only fixed-window counters for authenticated application API abuse protection.';
comment on function public.consume_api_rate_limit(text, integer, integer) is
  'Atomically consumes one request from a server-only API rate-limit bucket.';
