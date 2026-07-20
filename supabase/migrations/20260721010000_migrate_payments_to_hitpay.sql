-- Route new online payments through HitPay while preserving historical Stripe audit rows.
alter table public.payments
  add column if not exists provider_charge_id text;

alter table public.payments
  alter column provider set default 'hitpay';

alter table public.payments
  drop constraint if exists payments_provider_check;

alter table public.payments
  add constraint payments_provider_check
  check (provider in ('hitpay', 'stripe', 'manual'));

create unique index if not exists payments_provider_charge_id_unique
  on public.payments (provider, provider_charge_id)
  where provider_charge_id is not null;

comment on column public.payments.provider is
  'Payment provider. New online payments use hitpay; stripe remains valid for historical audit records.';

comment on column public.payments.provider_payment_id is
  'Provider payment-request identifier used for checkout and webhook reconciliation.';

comment on column public.payments.provider_charge_id is
  'Provider charge/payment identifier used for refunds after a successful payment.';
