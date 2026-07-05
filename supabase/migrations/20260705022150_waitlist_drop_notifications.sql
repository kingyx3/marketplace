-- Durable waitlist entries for drop notifications.
-- Provider credentials stay in environment variables; this stores only
-- customer-owned contact targets and delivery state.

create table if not exists public.waitlist_entries (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  sku_id uuid not null references public.booster_box_skus(id) on delete cascade,
  channel public.notification_channel not null default 'email',
  contact text not null check (length(trim(contact)) between 3 and 255),
  status text not null default 'active'
    check (status in ('active', 'notified', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  notified_at timestamptz,
  unique (customer_id, sku_id, channel)
);

alter table public.waitlist_entries enable row level security;

drop trigger if exists set_updated_at on public.waitlist_entries;
create trigger set_updated_at before update on public.waitlist_entries
  for each row execute function public.set_updated_at();

drop trigger if exists audit_log on public.waitlist_entries;
create trigger audit_log after insert or update or delete on public.waitlist_entries
  for each row execute function public.write_audit_log();

create index if not exists idx_waitlist_entries_sku_status_created
  on public.waitlist_entries(sku_id, status, created_at);

grant select on table public.waitlist_entries to authenticated, service_role;
grant insert, update, delete on table public.waitlist_entries to service_role;

drop policy if exists "own waitlist entries" on public.waitlist_entries;
create policy "own waitlist entries" on public.waitlist_entries
  for select to authenticated
  using (
    customer_id in (
      select id from public.customers where auth_user_id = (select auth.uid())
    )
  );
