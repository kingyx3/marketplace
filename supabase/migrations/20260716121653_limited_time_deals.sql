-- Audience-aware, time-bounded promotions. Regular SKU prices remain public,
-- while member-only discount metadata is protected by RLS and never returned
-- to anonymous storefront requests.

create table public.limited_time_deals (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  sku_id uuid not null references public.booster_box_skus(id) on delete cascade,
  title text not null,
  description text,
  discount_bps integer not null check (discount_bps between 1 and 9000),
  visibility text not null default 'members' check (visibility in ('public', 'members')),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  sort_priority integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint limited_time_deals_valid_window check (ends_at > starts_at),
  constraint limited_time_deals_code_format
    check (code ~ '^[a-z0-9]+([_-][a-z0-9]+)*$')
);

create index idx_limited_time_deals_storefront
  on public.limited_time_deals (active, visibility, starts_at, ends_at, sort_priority, id);
create index idx_limited_time_deals_sku_window
  on public.limited_time_deals (sku_id, active, starts_at, ends_at);

alter table public.limited_time_deals enable row level security;

grant select on public.limited_time_deals to anon, authenticated;
grant select, insert, update, delete on public.limited_time_deals to service_role;

drop policy if exists "public deal previews readable" on public.limited_time_deals;
create policy "public deal previews readable"
  on public.limited_time_deals
  for select
  to anon
  using (
    active
    and visibility = 'public'
    and starts_at <= now()
    and ends_at > now()
  );

drop policy if exists "signed in customers read active deals" on public.limited_time_deals;
create policy "signed in customers read active deals"
  on public.limited_time_deals
  for select
  to authenticated
  using (
    active
    and starts_at <= now()
    and ends_at > now()
    and (select auth.uid()) is not null
    and coalesce((select (auth.jwt()->>'is_anonymous')::boolean), false) = false
  );

drop trigger if exists trg_limited_time_deals_updated_at on public.limited_time_deals;
create trigger trg_limited_time_deals_updated_at
before update on public.limited_time_deals
for each row execute function public.set_updated_at();

drop trigger if exists audit_limited_time_deals on public.limited_time_deals;
create trigger audit_limited_time_deals
after insert or update or delete on public.limited_time_deals
for each row execute function public.write_audit_log();

create or replace function public.admin_upsert_limited_time_deal(
  p_deal_id uuid,
  p_code text,
  p_sku_id uuid,
  p_title text,
  p_description text,
  p_discount_bps integer,
  p_visibility text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_sort_priority integer,
  p_active boolean,
  p_actor text
)
returns table (deal_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid := coalesce(p_deal_id, gen_random_uuid());
  v_code text := lower(trim(coalesce(p_code, '')));
  v_title text := trim(coalesce(p_title, ''));
  v_visibility text := lower(trim(coalesce(p_visibility, '')));
begin
  if trim(coalesce(p_actor, '')) = '' then
    raise exception 'actor required' using errcode = '22023';
  end if;
  if v_code !~ '^[a-z0-9]+([_-][a-z0-9]+)*$' then
    raise exception 'deal code must use lowercase words separated by _ or -' using errcode = '22023';
  end if;
  if v_title = '' or length(v_title) > 160 then
    raise exception 'deal title must be between 1 and 160 characters' using errcode = '22023';
  end if;
  if p_discount_bps is null or p_discount_bps < 1 or p_discount_bps > 9000 then
    raise exception 'deal discount must be between 1 and 9000 basis points' using errcode = '22023';
  end if;
  if v_visibility not in ('public', 'members') then
    raise exception 'deal visibility must be public or members' using errcode = '22023';
  end if;
  if p_starts_at is null or p_ends_at is null or p_ends_at <= p_starts_at then
    raise exception 'deal end must be after its start' using errcode = '22023';
  end if;
  if not exists (select 1 from public.booster_box_skus where id = p_sku_id) then
    raise exception 'deal SKU not found' using errcode = 'P0002';
  end if;

  insert into public.limited_time_deals (
    id,
    code,
    sku_id,
    title,
    description,
    discount_bps,
    visibility,
    starts_at,
    ends_at,
    sort_priority,
    active
  )
  values (
    v_id,
    v_code,
    p_sku_id,
    v_title,
    nullif(trim(coalesce(p_description, '')), ''),
    p_discount_bps,
    v_visibility,
    p_starts_at,
    p_ends_at,
    coalesce(p_sort_priority, 0),
    coalesce(p_active, true)
  )
  on conflict (id) do update
    set code = excluded.code,
        sku_id = excluded.sku_id,
        title = excluded.title,
        description = excluded.description,
        discount_bps = excluded.discount_bps,
        visibility = excluded.visibility,
        starts_at = excluded.starts_at,
        ends_at = excluded.ends_at,
        sort_priority = excluded.sort_priority,
        active = excluded.active
  returning id into v_id;

  insert into public.audit_logs (actor, table_name, record_id, action, new_data)
  values (
    trim(p_actor),
    'limited_time_deals',
    v_id::text,
    'ADMIN_LIMITED_TIME_DEAL_UPSERT',
    jsonb_build_object(
      'deal_id', v_id,
      'code', v_code,
      'sku_id', p_sku_id,
      'visibility', v_visibility,
      'discount_bps', p_discount_bps,
      'active', coalesce(p_active, true)
    )
  );

  return query select v_id;
end;
$$;

create or replace function public.admin_set_limited_time_deal_active(
  p_deal_id uuid,
  p_active boolean,
  p_actor text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if trim(coalesce(p_actor, '')) = '' then
    raise exception 'actor required' using errcode = '22023';
  end if;

  update public.limited_time_deals
     set active = coalesce(p_active, false)
   where id = p_deal_id;

  if not found then
    raise exception 'deal not found' using errcode = 'P0002';
  end if;

  insert into public.audit_logs (actor, table_name, record_id, action, new_data)
  values (
    trim(p_actor),
    'limited_time_deals',
    p_deal_id::text,
    'ADMIN_LIMITED_TIME_DEAL_STATUS',
    jsonb_build_object('deal_id', p_deal_id, 'active', coalesce(p_active, false))
  );
end;
$$;

revoke all on function public.admin_upsert_limited_time_deal(
  uuid, text, uuid, text, text, integer, text, timestamptz, timestamptz, integer, boolean, text
) from public, anon, authenticated;
grant execute on function public.admin_upsert_limited_time_deal(
  uuid, text, uuid, text, text, integer, text, timestamptz, timestamptz, integer, boolean, text
) to service_role;

revoke all on function public.admin_set_limited_time_deal_active(uuid, boolean, text)
  from public, anon, authenticated;
grant execute on function public.admin_set_limited_time_deal_active(uuid, boolean, text)
  to service_role;
