-- Standardize checkout reservation and full-upfront preorder state.

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

-- Active preorders use one full payment and never carry a later balance. Historical
-- completed/cancelled development fixtures remain readable while the app is pre-production.
alter table public.preorders
  drop constraint if exists preorders_full_upfront_payment;
alter table public.preorders
  add constraint preorders_full_upfront_payment
  check (
    status not in ('pending_payment', 'paid', 'allocated', 'refund_pending')
    or (
      deposit_cents = quantity * unit_price_cents
      and balance_cents = 0
    )
  ) not valid;

create index if not exists idx_orders_checkout_reservation_expiry
  on public.orders(checkout_reserved_until)
  where status = 'pending_payment';

create index if not exists idx_preorders_paid_allocation_queue
  on public.preorders(sku_id, created_at, id)
  where status in ('paid', 'allocated', 'refund_pending');
