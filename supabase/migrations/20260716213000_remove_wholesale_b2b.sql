-- Retire wholesale/B2B runtime capabilities while preserving retail order flows.

begin;

-- Release any still-open invoice allocations before removing invoice checkout state.
do $$
declare
  v_order_id uuid;
begin
  if to_regclass('public.orders') is not null
     and to_regprocedure('public.release_order_allocation(uuid)') is not null then
    for v_order_id in
      select id
      from public.orders
      where payment_method = 'manual_invoice'
        and status in ('draft', 'pending_payment')
      for update
    loop
      perform public.release_order_allocation(v_order_id);
      update public.payments
         set status = 'cancelled'
       where order_id = v_order_id
         and provider = 'manual_invoice'
         and status in ('pending', 'requires_capture', 'authorized');
      update public.orders
         set status = 'cancelled'
       where id = v_order_id;
    end loop;
  end if;
end $$;

-- Normalize all active commerce records and storefront listings to retail.
update public.orders set channel = 'b2c' where channel::text <> 'b2c';
update public.preorders set channel = 'b2c' where channel::text <> 'b2c';
delete from public.allocation_rules where channel::text <> 'b2c';

update public.listing_items
set channels = array['b2c']::text[]
where channels is distinct from array['b2c']::text[];

alter table public.listing_items
  drop constraint if exists listing_items_channels_valid;
alter table public.listing_items
  add constraint listing_items_channels_valid
  check (channels = array['b2c']::text[]);

-- Keep the existing RPC signature for deployed clients, but ignore channel input.
create or replace function public.admin_upsert_listing_item(
  p_product_id uuid,
  p_title_override text,
  p_badge_label text,
  p_tags text[],
  p_channels text[],
  p_max_per_customer integer,
  p_preorder_reserve integer,
  p_sort_priority integer,
  p_featured boolean,
  p_published boolean,
  p_actor text
)
returns table (listing_item_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_listing_item_id uuid;
  v_tags text[] := '{}'::text[];
begin
  if trim(coalesce(p_actor, '')) = '' then
    raise exception 'actor required' using errcode = '22023';
  end if;

  perform 1 from public.products where id = p_product_id;
  if not found then
    raise exception 'product not found' using errcode = 'P0002';
  end if;

  if p_max_per_customer is not null and p_max_per_customer <= 0 then
    raise exception 'max per customer must be positive' using errcode = '22023';
  end if;

  if coalesce(p_preorder_reserve, 0) < 0 then
    raise exception 'preorder reserve must be non-negative' using errcode = '22023';
  end if;

  select coalesce(array_agg(cleaned_tag order by cleaned_tag), '{}'::text[])
    into v_tags
  from (
    select distinct trim(tag) as cleaned_tag
    from unnest(coalesce(p_tags, '{}'::text[])) as raw_tags(tag)
  ) tags
  where cleaned_tag <> '';

  insert into public.listing_items (
    product_id,
    title_override,
    badge_label,
    tags,
    channels,
    max_per_customer,
    preorder_reserve,
    sort_priority,
    featured,
    published
  )
  values (
    p_product_id,
    nullif(trim(coalesce(p_title_override, '')), ''),
    nullif(trim(coalesce(p_badge_label, '')), ''),
    v_tags,
    array['b2c']::text[],
    p_max_per_customer,
    coalesce(p_preorder_reserve, 0),
    coalesce(p_sort_priority, 0),
    coalesce(p_featured, false),
    coalesce(p_published, true)
  )
  on conflict (product_id) do update
  set title_override = excluded.title_override,
      badge_label = excluded.badge_label,
      tags = excluded.tags,
      channels = array['b2c']::text[],
      max_per_customer = excluded.max_per_customer,
      preorder_reserve = excluded.preorder_reserve,
      sort_priority = excluded.sort_priority,
      featured = excluded.featured,
      published = excluded.published,
      updated_at = now()
  returning id into v_listing_item_id;

  insert into public.audit_logs (actor, table_name, record_id, action, new_data)
  values (
    trim(p_actor),
    'listing_items',
    v_listing_item_id::text,
    'UPSERT',
    jsonb_build_object(
      'product_id', p_product_id,
      'channels', array['b2c']::text[],
      'published', coalesce(p_published, true),
      'featured', coalesce(p_featured, false)
    )
  );

  return query select v_listing_item_id;
end;
$$;

-- Remove wholesale configurations and callable database APIs.
delete from public.storefront_configurations
where "key" = 'b2b_invoice_policy';

drop function if exists public.create_b2b_invoice_order_from_cart(
  uuid, jsonb, jsonb, text, integer, integer, integer, integer
);
drop function if exists public.admin_set_b2b_credit_terms(uuid, text, integer, text);
drop function if exists public.expire_stale_invoice_orders(integer);
drop function if exists public.admin_review_b2b_account(uuid, text, uuid, text, text);
drop function if exists public.admin_remove_b2b_pricing_tier(uuid, uuid, text);

-- Remove invoice-only order state.
drop index if exists public.uq_orders_customer_invoice_reference;
drop index if exists public.idx_orders_invoice_expiry;
alter table public.orders drop constraint if exists orders_payment_method_check;
alter table public.orders drop constraint if exists orders_invoice_deadlines_check;
alter table public.orders
  drop column if exists payment_method,
  drop column if exists invoice_reference,
  drop column if exists payment_due_at,
  drop column if exists allocation_expires_at;

-- Remove wholesale account and tier data after dependent functions are gone.
drop table if exists public.customer_pricing_tiers cascade;
drop table if exists public.pricing_tiers cascade;
drop table if exists public.b2b_accounts cascade;

-- The enum is referenced by long-lived checkout functions. Remove the active B2B label
-- without replacing the enum OID or breaking those function signatures.
do $$
begin
  if exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    join pg_enum e on e.enumtypid = t.oid
    where n.nspname = 'public'
      and t.typname = 'sales_channel'
      and e.enumlabel = 'b2b'
  ) then
    alter type public.sales_channel rename value 'b2b' to 'retired_legacy';
  end if;
end $$;

alter table public.orders alter column channel set default 'b2c';
alter table public.preorders alter column channel set default 'b2c';

commit;
