-- Make the exact deal price authoritative. The legacy discount basis points
-- remain as derived metadata for compatibility and reporting only.

begin;

alter table public.limited_time_deals
  add column if not exists deal_price_cents integer;

do $$
begin
  if exists (
    select 1
    from public.limited_time_deals deal
    join public.booster_box_skus sku on sku.id = deal.sku_id
    where sku.price_cents <= 1
  ) then
    raise exception 'limited-time deals require SKU prices above one cent before exact price migration'
      using errcode = '23514';
  end if;
end;
$$;

update public.limited_time_deals deal
set deal_price_cents = greatest(
  1,
  least(
    sku.price_cents - 1,
    sku.price_cents
      - floor((sku.price_cents::numeric * deal.discount_bps::numeric) / 10000)::integer
  )
)
from public.booster_box_skus sku
where sku.id = deal.sku_id
  and deal.deal_price_cents is null;

alter table public.limited_time_deals
  alter column deal_price_cents set not null,
  drop constraint if exists limited_time_deals_discount_bps_check,
  add constraint limited_time_deals_discount_bps_check
    check (discount_bps between 1 and 9999),
  add constraint limited_time_deals_positive_deal_price
    check (deal_price_cents > 0);

create or replace function public.validate_limited_time_deal_price()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_original_price_cents integer;
begin
  select price_cents into v_original_price_cents
  from public.booster_box_skus
  where id = new.sku_id;

  if v_original_price_cents is null then
    raise exception 'deal SKU not found' using errcode = 'P0002';
  end if;
  if v_original_price_cents <= 0 then
    raise exception 'deal SKU must have a positive original price' using errcode = '22023';
  end if;
  if new.deal_price_cents is null
     or new.deal_price_cents <= 0
     or new.deal_price_cents >= v_original_price_cents then
    raise exception 'deal price must be positive and lower than the original price'
      using errcode = '22023';
  end if;

  new.discount_bps := greatest(
    1,
    least(
      9999,
      round(
        ((v_original_price_cents - new.deal_price_cents)::numeric * 10000)
        / v_original_price_cents::numeric
      )::integer
    )
  );
  return new;
end;
$$;

revoke all on function public.validate_limited_time_deal_price()
  from public, anon, authenticated;
grant execute on function public.validate_limited_time_deal_price() to service_role;

drop trigger if exists trg_validate_limited_time_deal_price on public.limited_time_deals;
create trigger trg_validate_limited_time_deal_price
before insert or update of sku_id, deal_price_cents
on public.limited_time_deals
for each row execute function public.validate_limited_time_deal_price();

-- Remove the percentage-input mutation contract before creating the exact-price contract.
drop function if exists public.admin_upsert_pricing_promotion(
  uuid, text, uuid, text, text, integer, text, timestamptz,
  timestamptz, integer, boolean, uuid
);
drop function if exists public.admin_upsert_limited_time_deal(
  uuid, text, uuid, text, text, integer, text, timestamptz,
  timestamptz, integer, boolean, text
);

create or replace function public.admin_upsert_pricing_promotion(
  p_deal_id uuid,
  p_code text,
  p_sku_id uuid,
  p_title text,
  p_description text,
  p_deal_price_cents integer,
  p_visibility text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_sort_priority integer,
  p_active boolean,
  p_actor_auth_user_id uuid
)
returns table (deal_id uuid)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid := coalesce(p_deal_id, gen_random_uuid());
  v_code text := lower(trim(coalesce(p_code, '')));
  v_title text := trim(coalesce(p_title, ''));
  v_visibility text := lower(trim(coalesce(p_visibility, '')));
  v_original_price_cents integer;
  v_discount_bps integer;
begin
  if not public.control_actor_has_permission(p_actor_auth_user_id, 'pricing.manage') then
    raise exception 'pricing management permission required' using errcode = '42501';
  end if;
  if coalesce(p_active, false)
     and not public.control_actor_has_permission(p_actor_auth_user_id, 'pricing.approve') then
    raise exception 'sensitive pricing approval required' using errcode = '42501';
  end if;
  if v_code !~ '^[a-z0-9]+([_-][a-z0-9]+)*$' then
    raise exception 'deal code must use lowercase words separated by _ or -' using errcode = '22023';
  end if;
  if v_title = '' or length(v_title) > 160 then
    raise exception 'deal title must be between 1 and 160 characters' using errcode = '22023';
  end if;
  if length(coalesce(p_description, '')) > 500 then
    raise exception 'deal description must be 500 characters or fewer' using errcode = '22023';
  end if;
  if v_visibility not in ('public', 'members') then
    raise exception 'deal visibility must be public or members' using errcode = '22023';
  end if;
  if p_starts_at is null or p_ends_at is null or p_ends_at <= p_starts_at then
    raise exception 'deal end must be after its start' using errcode = '22023';
  end if;

  select price_cents into v_original_price_cents
  from public.booster_box_skus
  where id = p_sku_id;
  if v_original_price_cents is null then
    raise exception 'deal SKU not found' using errcode = 'P0002';
  end if;
  if p_deal_price_cents is null
     or p_deal_price_cents <= 0
     or p_deal_price_cents >= v_original_price_cents then
    raise exception 'deal price must be positive and lower than the original price'
      using errcode = '22023';
  end if;

  v_discount_bps := greatest(
    1,
    least(
      9999,
      round(
        ((v_original_price_cents - p_deal_price_cents)::numeric * 10000)
        / v_original_price_cents::numeric
      )::integer
    )
  );

  insert into public.limited_time_deals (
    id,
    code,
    sku_id,
    title,
    description,
    discount_bps,
    deal_price_cents,
    visibility,
    starts_at,
    ends_at,
    sort_priority,
    active
  ) values (
    v_id,
    v_code,
    p_sku_id,
    v_title,
    nullif(trim(coalesce(p_description, '')), ''),
    v_discount_bps,
    p_deal_price_cents,
    v_visibility,
    p_starts_at,
    p_ends_at,
    coalesce(p_sort_priority, 0),
    coalesce(p_active, false)
  )
  on conflict (id) do update
    set code = excluded.code,
        sku_id = excluded.sku_id,
        title = excluded.title,
        description = excluded.description,
        discount_bps = excluded.discount_bps,
        deal_price_cents = excluded.deal_price_cents,
        visibility = excluded.visibility,
        starts_at = excluded.starts_at,
        ends_at = excluded.ends_at,
        sort_priority = excluded.sort_priority,
        active = excluded.active
  returning id into v_id;

  insert into public.audit_logs (actor, table_name, record_id, action, new_data)
  values (
    concat('staff:', p_actor_auth_user_id),
    'limited_time_deals',
    v_id::text,
    'CONTROL_PRICING_PROMOTION_UPSERT',
    jsonb_build_object(
      'deal_id', v_id,
      'code', v_code,
      'sku_id', p_sku_id,
      'original_price_cents', v_original_price_cents,
      'deal_price_cents', p_deal_price_cents,
      'discount_bps', v_discount_bps,
      'visibility', v_visibility,
      'active', coalesce(p_active, false)
    )
  );

  return query select v_id;
end;
$$;

revoke all on function public.admin_upsert_pricing_promotion(
  uuid, text, uuid, text, text, integer, text, timestamptz,
  timestamptz, integer, boolean, uuid
) from public, anon, authenticated;
grant execute on function public.admin_upsert_pricing_promotion(
  uuid, text, uuid, text, text, integer, text, timestamptz,
  timestamptz, integer, boolean, uuid
) to service_role;

create or replace function public.admin_set_pricing_promotion_active(
  p_deal_id uuid,
  p_active boolean,
  p_actor_auth_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_deal_price_cents integer;
  v_original_price_cents integer;
begin
  if not public.control_actor_has_permission(p_actor_auth_user_id, 'pricing.approve') then
    raise exception 'sensitive pricing approval required' using errcode = '42501';
  end if;

  select deal.deal_price_cents, sku.price_cents
    into v_deal_price_cents, v_original_price_cents
  from public.limited_time_deals deal
  join public.booster_box_skus sku on sku.id = deal.sku_id
  where deal.id = p_deal_id;

  if v_deal_price_cents is null then
    raise exception 'deal not found' using errcode = 'P0002';
  end if;
  if coalesce(p_active, false)
     and (v_original_price_cents <= 0 or v_deal_price_cents >= v_original_price_cents) then
    raise exception 'deal price must remain lower than the original price before activation'
      using errcode = '23514';
  end if;

  perform public.admin_set_limited_time_deal_active(
    p_deal_id, p_active, concat('staff:', p_actor_auth_user_id)
  );
end;
$$;

revoke all on function public.admin_set_pricing_promotion_active(uuid, boolean, uuid)
  from public, anon, authenticated;
grant execute on function public.admin_set_pricing_promotion_active(uuid, boolean, uuid)
  to service_role;

commit;
