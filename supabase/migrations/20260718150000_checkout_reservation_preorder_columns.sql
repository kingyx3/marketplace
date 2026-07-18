-- Introduce checkout reservation and full-upfront preorder state.
-- PostgreSQL requires newly added enum values to commit before later migrations
-- reference them in constraints, indexes, or functions.

alter type public.preorder_status add value if not exists 'pending_payment';
alter type public.preorder_status add value if not exists 'refund_pending';

alter table public.orders
  add column if not exists checkout_reserved_until timestamptz;

alter table public.preorders
  add column if not exists allocation_refund_cents integer not null default 0,
  add column if not exists allocation_confirmed_at timestamptz,
  add column if not exists allocation_actor text,
  add column if not exists allocation_fingerprint text;

alter table public.preorders
  drop constraint if exists preorders_allocation_refund_non_negative;
alter table public.preorders
  add constraint preorders_allocation_refund_non_negative
  check (allocation_refund_cents >= 0);
