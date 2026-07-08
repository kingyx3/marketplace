-- Storefront listing management layered on top of catalog products.
-- Admins manage per-product listing controls and global storefront copy in Supabase;
-- the public catalog reads these rows through RLS-filtered published views.

create table if not exists public.listing_items (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null unique references public.products(id) on delete cascade,
  title_override text,
  badge_label text,
  tags text[] not null default '{}'::text[],
  channels public.sales_channel[] not null default array['b2c']::public.sales_channel[],
  max_per_customer integer check (max_per_customer is null or max_per_customer > 0),
  preorder_reserve integer not null default 0 check (preorder_reserve >= 0),
  sort_priority integer not null default 0,
  featured boolean not null default false,
  published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint listing_items_channels_required check (cardinality(channels) > 0)
);

create table if not exists public.storefront_configurations (
  key text primary key,
  label text not null,
  description text,
  value jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint storefront_configurations_key_format check (key ~ '^[a-z0-9]+([_:-][a-z0-9]+)*$')
);

alter table public.listing_items enable row level security;
alter table public.storefront_configurations enable row level security;

drop trigger if exists set_updated_at on public.listing_items;
create trigger set_updated_at before update on public.listing_items
  for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at on public.storefront_configurations;
create trigger set_updated_at before update on public.storefront_configurations
  for each row execute function public.set_updated_at();

drop trigger if exists audit_log on public.listing_items;
create trigger audit_log after insert or update or delete on public.listing_items
  for each row execute function public.write_audit_log();

drop trigger if exists audit_log on public.storefront_configurations;
create trigger audit_log after insert or update or delete on public.storefront_configurations
  for each row execute function public.write_audit_log();

drop policy if exists "published listing items readable" on public.listing_items;
create policy "published listing items readable" on public.listing_items
  for select using (
    published
    and exists (
      select 1 from public.products p where p.id = listing_items.product_id and p.active
    )
  );

drop policy if exists "active storefront configurations readable" on public.storefront_configurations;
create policy "active storefront configurations readable" on public.storefront_configurations
  for select using (active);

grant select on table public.listing_items to anon, authenticated, service_role;
grant insert, update, delete on table public.listing_items to service_role;
grant select on table public.storefront_configurations to anon, authenticated, service_role;
grant insert, update, delete on table public.storefront_configurations to service_role;

create or replace function public.create_default_listing_item()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.listing_items (product_id)
  values (new.id)
  on conflict (product_id) do nothing;

  return new;
end;
$$;

revoke all on function public.create_default_listing_item() from public, anon, authenticated;

drop trigger if exists create_default_listing_item on public.products;
create trigger create_default_listing_item
  after insert on public.products
  for each row execute function public.create_default_listing_item();

insert into public.listing_items (product_id)
select p.id
from public.products p
on conflict (product_id) do nothing;

insert into public.storefront_configurations (key, label, description, value, active)
values (
  'catalog_header',
  'Catalog header copy',
  'Eyebrow, title, description, and empty-state copy for the public catalog page.',
  '{"eyebrow":"Catalog","title":"Sealed product inventory","description":"Browse active booster boxes, collector boxes, cases, and preorders with visible stock and allocation limits.","emptyTitle":"No active products","emptyDescription":"Publish a listing item before opening orders."}'::jsonb,
  true
)
on conflict (key) do nothing;

create or replace function public.admin_upsert_listing_item(
  p_product_id uuid,
  p_title_override text,
  p_badge_label text,
  p_tags text[],
  p_channels public.sales_channel[],
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
  v_channels public.sales_channel[] := coalesce(p_channels, array['b2c']::public.sales_channel[]);
  v_exists boolean;
begin
  if trim(coalesce(p_actor, '')) = '' then
    raise exception 'actor required' using errcode = '22023';
  end if;

  perform 1 from public.products where id = p_product_id;
  if not found then
    raise exception 'product not found' using errcode = 'P0002';
  end if;

  if cardinality(v_channels) = 0 then
    v_channels := array['b2c']::public.sales_channel[];
  end if;

  if p_max_per_customer is not null and p_max_per_customer <= 0 then
    raise exception 'max per customer must be positive' using errcode = '22023';
  end if;

  if coalesce(p_preorder_reserve, 0) < 0 then
    raise exception 'preorder reserve must be non-negative' using errcode = '22023';
  end if;

  select coalesce(array_agg(distinct cleaned_tag order by cleaned_tag), '{}'::text[])
    into v_tags
  from (
    select trim(tag) as cleaned_tag
    from unnest(coalesce(p_tags, '{}'::text[])) as raw_tags(tag)
  ) tags
  where cleaned_tag <> '';

  select exists(select 1 from public.listing_items where product_id = p_product_id)
    into v_exists;

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
    v_channels,
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
        channels = excluded.channels,
        max_per_customer = excluded.max_per_customer,
        preorder_reserve = excluded.preorder_reserve,
        sort_priority = excluded.sort_priority,
        featured = excluded.featured,
        published = excluded.published
  returning id into v_listing_item_id;

  insert into public.audit_logs (actor, table_name, record_id, action, new_data)
  values (
    trim(p_actor),
    'listing_items',
    v_listing_item_id::text,
    case when v_exists then 'ADMIN_LISTING_ITEM_UPDATE' else 'ADMIN_LISTING_ITEM_CREATE' end,
    jsonb_build_object(
      'listing_item_id', v_listing_item_id,
      'product_id', p_product_id,
      'channels', v_channels,
      'published', coalesce(p_published, true),
      'featured', coalesce(p_featured, false),
      'sort_priority', coalesce(p_sort_priority, 0)
    )
  );

  return query select v_listing_item_id;
end;
$$;

create or replace function public.admin_upsert_storefront_configuration(
  p_key text,
  p_label text,
  p_description text,
  p_value jsonb,
  p_active boolean,
  p_actor text
)
returns table (configuration_key text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key text := lower(trim(coalesce(p_key, '')));
  v_label text := trim(coalesce(p_label, ''));
  v_exists boolean;
begin
  if trim(coalesce(p_actor, '')) = '' then
    raise exception 'actor required' using errcode = '22023';
  end if;

  if v_key !~ '^[a-z0-9]+([_:-][a-z0-9]+)*$' then
    raise exception 'configuration key must use lowercase words separated by _, :, or -' using errcode = '22023';
  end if;

  if v_label = '' then
    raise exception 'configuration label required' using errcode = '22023';
  end if;

  if p_value is null or jsonb_typeof(p_value) <> 'object' then
    raise exception 'configuration value must be a JSON object' using errcode = '22023';
  end if;

  select exists(select 1 from public.storefront_configurations where key = v_key)
    into v_exists;

  insert into public.storefront_configurations (key, label, description, value, active)
  values (
    v_key,
    v_label,
    nullif(trim(coalesce(p_description, '')), ''),
    p_value,
    coalesce(p_active, true)
  )
  on conflict (key) do update
    set label = excluded.label,
        description = excluded.description,
        value = excluded.value,
        active = excluded.active
  returning key into v_key;

  insert into public.audit_logs (actor, table_name, record_id, action, new_data)
  values (
    trim(p_actor),
    'storefront_configurations',
    v_key,
    case when v_exists then 'ADMIN_STOREFRONT_CONFIG_UPDATE' else 'ADMIN_STOREFRONT_CONFIG_CREATE' end,
    jsonb_build_object('key', v_key, 'active', coalesce(p_active, true))
  );

  return query select v_key;
end;
$$;

revoke all on function public.admin_upsert_listing_item(
  uuid, text, text, text[], public.sales_channel[], integer, integer, integer, boolean, boolean, text
) from public, anon, authenticated;
grant execute on function public.admin_upsert_listing_item(
  uuid, text, text, text[], public.sales_channel[], integer, integer, integer, boolean, boolean, text
) to service_role;

revoke all on function public.admin_upsert_storefront_configuration(
  text, text, text, jsonb, boolean, text
) from public, anon, authenticated;
grant execute on function public.admin_upsert_storefront_configuration(
  text, text, text, jsonb, boolean, text
) to service_role;
