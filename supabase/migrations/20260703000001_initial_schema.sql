-- ============================================================
-- Marketplace initial schema: TCG booster box distribution
-- (B2C retail, B2B wholesale, pre-orders).
--
-- Conventions:
--   * uuid primary keys (gen_random_uuid)
--   * money stored as integer cents + currency code (no floats)
--   * timestamptz everywhere; updated_at maintained by trigger
--   * RLS enabled on every table; the service role bypasses RLS
--     for admin/webhook paths. Anonymous role gets read access to
--     catalog tables only. Authenticated customers see their own rows.
--
-- See docs/data-model.md for the narrative version of this schema.
-- ============================================================

create extension if not exists "pgcrypto";

-- ---------- shared helpers ----------

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- Generic audit trigger: writes old/new row images to audit_logs.
create table public.audit_logs (
  id          uuid primary key default gen_random_uuid(),
  actor       text,                     -- auth.uid() or 'service'
  table_name  text not null,
  record_id   text,
  action      text not null,            -- INSERT / UPDATE / DELETE
  old_data    jsonb,
  new_data    jsonb,
  created_at  timestamptz not null default now()
);

create or replace function public.write_audit_log()
returns trigger language plpgsql security definer as $$
begin
  insert into public.audit_logs (actor, table_name, record_id, action, old_data, new_data)
  values (
    coalesce(auth.uid()::text, 'service'),
    tg_table_name,
    coalesce((case when tg_op = 'DELETE' then old.id else new.id end)::text, null),
    tg_op,
    case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end
  );
  return coalesce(new, old);
end $$;

-- ---------- enums ----------

create type public.set_status         as enum ('announced','preorder_open','preorder_closed','released','out_of_print');
create type public.preorder_status    as enum ('pending_deposit','deposited','allocated','balance_due','paid','converted','cancelled','refunded');
create type public.order_status       as enum ('draft','pending_payment','paid','packing','shipped','delivered','cancelled','refunded');
create type public.payment_status     as enum ('requires_capture','authorized','captured','failed','cancelled','refunded');
create type public.refund_status      as enum ('pending','succeeded','failed');
create type public.shipment_status    as enum ('pending','label_created','in_transit','delivered','returned','lost');
create type public.po_status          as enum ('draft','submitted','confirmed','partially_received','received','cancelled');
create type public.sales_channel      as enum ('b2c','b2b');
create type public.notification_channel as enum ('email','sms','telegram','whatsapp');
create type public.notification_status  as enum ('queued','sent','failed');

-- ---------- catalog ----------

create table public.tcg_categories (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  name        text not null,            -- e.g. Magic: The Gathering
  publisher   text,                     -- e.g. Wizards of the Coast
  description text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.sets_releases (
  id                uuid primary key default gen_random_uuid(),
  category_id       uuid not null references public.tcg_categories(id),
  name              text not null,      -- e.g. Bloomburrow
  code              text not null,      -- e.g. BLB
  release_date      date,
  preorder_open_at  timestamptz,
  preorder_close_at timestamptz,
  status            public.set_status not null default 'announced',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (category_id, code)
);

create table public.products (
  id           uuid primary key default gen_random_uuid(),
  category_id  uuid not null references public.tcg_categories(id),
  set_id       uuid references public.sets_releases(id),
  slug         text not null unique,
  name         text not null,
  product_type text not null,           -- booster_box, collector_box, bundle, case
  description  text,
  language     text not null default 'EN',
  image_url    text,
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Variants distinguish e.g. print run / language / retail vs collector wave.
create table public.product_variants (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references public.products(id) on delete cascade,
  name        text not null default 'default',
  attributes  jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (product_id, name)
);

-- The sellable unit: one sealed booster box SKU.
create table public.booster_box_skus (
  id                 uuid primary key default gen_random_uuid(),
  product_variant_id uuid not null references public.product_variants(id) on delete cascade,
  sku                text not null unique,
  barcode            text,
  packs_per_box      integer,
  cards_per_pack     integer,
  msrp_cents         integer check (msrp_cents is null or msrp_cents >= 0),
  price_cents        integer not null check (price_cents >= 0),  -- current B2C list price
  currency           text not null default 'SGD',
  weight_grams       integer,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- ---------- inventory & supply ----------

create table public.inventory (
  id           uuid primary key default gen_random_uuid(),
  sku_id       uuid not null references public.booster_box_skus(id),
  location     text not null default 'main',
  on_hand      integer not null default 0 check (on_hand >= 0),
  allocated    integer not null default 0 check (allocated >= 0),
  incoming     integer not null default 0 check (incoming >= 0),
  safety_stock integer not null default 0 check (safety_stock >= 0),
  -- Oversell guard: never promise more than physically-or-confirmed stock.
  constraint inventory_no_oversell check (allocated <= on_hand + incoming),
  available    integer generated always as (on_hand - allocated) stored,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (sku_id, location)
);

create table public.suppliers (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  supplier_type    text not null default 'distributor',  -- distributor, publisher_direct, peer_retailer
  region           text,                                  -- e.g. SG, SEA, US
  contact          jsonb not null default '{}'::jsonb,
  payment_terms    text,                                  -- e.g. prepaid, NET30
  min_order_cents  integer,
  currency         text not null default 'SGD',
  notes            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table public.purchase_orders (
  id           uuid primary key default gen_random_uuid(),
  supplier_id  uuid not null references public.suppliers(id),
  status       public.po_status not null default 'draft',
  currency     text not null default 'SGD',
  placed_at    timestamptz,
  expected_at  date,
  total_cents  integer not null default 0 check (total_cents >= 0),
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table public.purchase_order_items (
  id                 uuid primary key default gen_random_uuid(),
  purchase_order_id  uuid not null references public.purchase_orders(id) on delete cascade,
  sku_id             uuid not null references public.booster_box_skus(id),
  quantity           integer not null check (quantity > 0),
  unit_cost_cents    integer not null check (unit_cost_cents >= 0),
  received_quantity  integer not null default 0 check (received_quantity >= 0),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- ---------- customers & pricing ----------

create table public.customers (
  id               uuid primary key default gen_random_uuid(),
  auth_user_id     uuid unique references auth.users(id) on delete set null,
  email            text not null unique,
  name             text,
  phone            text,
  segment          text not null default 'player',   -- player, collector, investor, reseller
  default_currency text not null default 'SGD',
  marketing_opt_in boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table public.b2b_accounts (
  id                 uuid primary key default gen_random_uuid(),
  customer_id        uuid not null unique references public.customers(id),
  company_name       text not null,
  business_reg_no    text,                          -- e.g. Singapore UEN
  billing_address    jsonb not null default '{}'::jsonb,
  credit_limit_cents integer not null default 0 check (credit_limit_cents >= 0),
  payment_terms      text not null default 'prepaid',
  approved           boolean not null default false,
  approved_at        timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create table public.pricing_tiers (
  id              uuid primary key default gen_random_uuid(),
  code            text not null unique,             -- e.g. retail, wholesale_1, wholesale_2
  name            text not null,
  description     text,
  discount_bps    integer not null default 0 check (discount_bps between 0 and 10000),
  min_order_cents integer not null default 0 check (min_order_cents >= 0),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table public.customer_pricing_tiers (
  customer_id     uuid not null references public.customers(id) on delete cascade,
  pricing_tier_id uuid not null references public.pricing_tiers(id) on delete cascade,
  assigned_at     timestamptz not null default now(),
  primary key (customer_id, pricing_tier_id)
);

-- ---------- pre-orders, orders, payments ----------

create table public.preorders (
  id               uuid primary key default gen_random_uuid(),
  customer_id      uuid not null references public.customers(id),
  sku_id           uuid not null references public.booster_box_skus(id),
  channel          public.sales_channel not null default 'b2c',
  quantity         integer not null check (quantity > 0),
  unit_price_cents integer not null check (unit_price_cents >= 0),
  deposit_cents    integer not null default 0 check (deposit_cents >= 0),
  balance_cents    integer not null default 0 check (balance_cents >= 0),
  currency         text not null default 'SGD',
  status           public.preorder_status not null default 'pending_deposit',
  allocated_qty    integer not null default 0 check (allocated_qty >= 0),
  order_id         uuid,                              -- set when converted to an order
  notes            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table public.orders (
  id             uuid primary key default gen_random_uuid(),
  customer_id    uuid not null references public.customers(id),
  channel        public.sales_channel not null default 'b2c',
  status         public.order_status not null default 'draft',
  currency       text not null default 'SGD',
  subtotal_cents integer not null default 0 check (subtotal_cents >= 0),
  shipping_cents integer not null default 0 check (shipping_cents >= 0),
  tax_cents      integer not null default 0 check (tax_cents >= 0),  -- GST line; see docs
  total_cents    integer not null default 0 check (total_cents >= 0),
  placed_at      timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

alter table public.preorders
  add constraint preorders_order_fk foreign key (order_id) references public.orders(id);

create table public.order_items (
  id               uuid primary key default gen_random_uuid(),
  order_id         uuid not null references public.orders(id) on delete cascade,
  sku_id           uuid not null references public.booster_box_skus(id),
  preorder_id      uuid references public.preorders(id),
  quantity         integer not null check (quantity > 0),
  unit_price_cents integer not null check (unit_price_cents >= 0),
  created_at       timestamptz not null default now()
);

create table public.payments (
  id                  uuid primary key default gen_random_uuid(),
  order_id            uuid references public.orders(id),
  preorder_id         uuid references public.preorders(id),
  provider            text not null default 'stripe',
  provider_payment_id text not null,                 -- Stripe PaymentIntent id
  kind                text not null default 'full',  -- deposit, balance, full
  amount_cents        integer not null check (amount_cents >= 0),
  currency            text not null default 'SGD',
  status              public.payment_status not null default 'requires_capture',
  captured_at         timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (provider, provider_payment_id),
  constraint payments_target check (order_id is not null or preorder_id is not null)
);

create table public.refunds (
  id                 uuid primary key default gen_random_uuid(),
  payment_id         uuid not null references public.payments(id),
  provider_refund_id text,
  amount_cents       integer not null check (amount_cents > 0),
  reason             text,
  status             public.refund_status not null default 'pending',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create table public.shipments (
  id              uuid primary key default gen_random_uuid(),
  order_id        uuid not null references public.orders(id),
  carrier         text,                              -- e.g. SingPost, Ninja Van, J&T, DHL
  tracking_number text,
  status          public.shipment_status not null default 'pending',
  address         jsonb not null default '{}'::jsonb,
  shipped_at      timestamptz,
  delivered_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ---------- allocation, notifications, integration ----------

-- Rules deciding who gets scarce stock first (mirrored by lib/allocation.ts).
create table public.allocation_rules (
  id               uuid primary key default gen_random_uuid(),
  set_id           uuid references public.sets_releases(id),
  sku_id           uuid references public.booster_box_skus(id),
  channel          public.sales_channel not null,
  priority         integer not null default 100,     -- lower = allocated first
  reserve_quantity integer not null default 0 check (reserve_quantity >= 0),
  max_per_customer integer check (max_per_customer is null or max_per_customer > 0),
  active           boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint allocation_rules_scope check (set_id is not null or sku_id is not null)
);

create table public.notifications (
  id          uuid primary key default gen_random_uuid(),
  customer_id uuid references public.customers(id),
  channel     public.notification_channel not null,
  template    text not null,                          -- e.g. preorder_confirmed
  payload     jsonb not null default '{}'::jsonb,
  status      public.notification_status not null default 'queued',
  sent_at     timestamptz,
  error       text,
  created_at  timestamptz not null default now()
);

-- Idempotency ledger for inbound provider webhooks (Stripe etc.).
create table public.webhook_events (
  id           uuid primary key default gen_random_uuid(),
  provider     text not null,
  event_id     text not null,
  event_type   text not null,
  payload      jsonb not null default '{}'::jsonb,
  processed_at timestamptz not null default now(),
  unique (provider, event_id)
);

-- ---------- updated_at triggers ----------

do $$
declare t text;
begin
  foreach t in array array[
    'tcg_categories','sets_releases','products','product_variants','booster_box_skus',
    'inventory','suppliers','purchase_orders','purchase_order_items',
    'customers','b2b_accounts','pricing_tiers',
    'preorders','orders','payments','refunds','shipments','allocation_rules'
  ] loop
    execute format(
      'create trigger set_updated_at before update on public.%I
         for each row execute function public.set_updated_at()', t);
  end loop;
end $$;

-- ---------- audit triggers on money/stock-critical tables ----------

do $$
declare t text;
begin
  foreach t in array array[
    'inventory','preorders','orders','payments','refunds','allocation_rules','b2b_accounts'
  ] loop
    execute format(
      'create trigger audit_log after insert or update or delete on public.%I
         for each row execute function public.write_audit_log()', t);
  end loop;
end $$;

-- ---------- indexes ----------

create index idx_products_category   on public.products(category_id);
create index idx_products_set        on public.products(set_id);
create index idx_variants_product    on public.product_variants(product_id);
create index idx_skus_variant        on public.booster_box_skus(product_variant_id);
create index idx_inventory_sku       on public.inventory(sku_id);
create index idx_po_items_po         on public.purchase_order_items(purchase_order_id);
create index idx_preorders_customer  on public.preorders(customer_id);
create index idx_preorders_sku       on public.preorders(sku_id) where status not in ('cancelled','refunded','converted');
create index idx_orders_customer     on public.orders(customer_id);
create index idx_order_items_order   on public.order_items(order_id);
create index idx_payments_order      on public.payments(order_id);
create index idx_payments_preorder   on public.payments(preorder_id);
create index idx_shipments_order     on public.shipments(order_id);
create index idx_notifications_cust  on public.notifications(customer_id);
create index idx_audit_logs_table    on public.audit_logs(table_name, created_at);

-- Full-text search over the catalog (upgrade path: Typesense/Algolia).
create index idx_products_fts on public.products
  using gin (to_tsvector('english', coalesce(name,'') || ' ' || coalesce(description,'')));

-- ---------- row level security ----------

-- Enable RLS everywhere. The service role key bypasses RLS.
do $$
declare t text;
begin
  foreach t in array array[
    'tcg_categories','sets_releases','products','product_variants','booster_box_skus',
    'inventory','suppliers','purchase_orders','purchase_order_items',
    'customers','b2b_accounts','pricing_tiers','customer_pricing_tiers',
    'preorders','orders','order_items','payments','refunds','shipments',
    'allocation_rules','notifications','audit_logs','webhook_events'
  ] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- Public (anon + authenticated) read access to catalog tables.
create policy "catalog readable" on public.tcg_categories  for select using (true);
create policy "catalog readable" on public.sets_releases   for select using (true);
create policy "catalog readable" on public.products        for select using (active);
create policy "catalog readable" on public.product_variants for select using (true);
create policy "catalog readable" on public.booster_box_skus for select using (true);

-- Availability (not cost/supply detail) is public read.
create policy "availability readable" on public.inventory for select using (true);

-- Customers see and edit their own profile row.
create policy "own customer row select" on public.customers
  for select using (auth.uid() = auth_user_id);
create policy "own customer row update" on public.customers
  for update using (auth.uid() = auth_user_id);

-- Customers see their own commercial documents (writes go through the
-- service role so state machines and stock checks stay server-side).
create policy "own preorders" on public.preorders for select
  using (customer_id in (select id from public.customers where auth_user_id = auth.uid()));
create policy "own orders" on public.orders for select
  using (customer_id in (select id from public.customers where auth_user_id = auth.uid()));
create policy "own order items" on public.order_items for select
  using (order_id in (select o.id from public.orders o
         join public.customers c on c.id = o.customer_id
         where c.auth_user_id = auth.uid()));
create policy "own payments" on public.payments for select
  using (
    order_id in (select o.id from public.orders o
      join public.customers c on c.id = o.customer_id where c.auth_user_id = auth.uid())
    or preorder_id in (select p.id from public.preorders p
      join public.customers c on c.id = p.customer_id where c.auth_user_id = auth.uid())
  );
create policy "own shipments" on public.shipments for select
  using (order_id in (select o.id from public.orders o
         join public.customers c on c.id = o.customer_id
         where c.auth_user_id = auth.uid()));
create policy "own b2b account" on public.b2b_accounts for select
  using (customer_id in (select id from public.customers where auth_user_id = auth.uid()));
create policy "own notifications" on public.notifications for select
  using (customer_id in (select id from public.customers where auth_user_id = auth.uid()));

-- suppliers, purchase_orders, purchase_order_items, pricing_tiers,
-- customer_pricing_tiers, allocation_rules, refunds, audit_logs,
-- webhook_events: NO anon/authenticated policies — service role only.
