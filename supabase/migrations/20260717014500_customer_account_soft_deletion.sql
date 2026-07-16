alter table public.customers
  add column if not exists deleted_at timestamptz;

create index if not exists customers_deleted_at_idx
  on public.customers (deleted_at)
  where deleted_at is not null;

comment on column public.customers.deleted_at is
  'When set, the storefront account is disabled while commercial history is retained.';
