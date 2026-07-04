-- Add delivery metadata needed for idempotent transactional email.
-- The notification provider remains configured by environment variables;
-- this migration stores only durable delivery state and provider ids.

alter type public.notification_status add value if not exists 'skipped';

alter table public.notifications
  add column if not exists provider text,
  add column if not exists provider_message_id text,
  add column if not exists dedupe_key text,
  add column if not exists updated_at timestamptz not null default now();

drop trigger if exists set_updated_at on public.notifications;
create trigger set_updated_at before update on public.notifications
  for each row execute function public.set_updated_at();

create unique index if not exists idx_notifications_dedupe_key
  on public.notifications(dedupe_key)
  where dedupe_key is not null;

create index if not exists idx_notifications_customer_created
  on public.notifications(customer_id, created_at desc);
