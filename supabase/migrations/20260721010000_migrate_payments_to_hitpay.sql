-- Route new online payments through HitPay while preserving historical and externally reconciled payment providers.
alter table public.payments
  add column if not exists provider_charge_id text;

alter table public.payments
  alter column provider set default 'hitpay';

-- The provider field is intentionally extensible. Runtime checkout writes
-- `hitpay`, while historical records, manual reconciliations, imports, and
-- contract fixtures may use other provider identifiers.
alter table public.payments
  drop constraint if exists payments_provider_check;

create unique index if not exists payments_provider_charge_id_unique
  on public.payments (provider, provider_charge_id)
  where provider_charge_id is not null;

comment on column public.payments.provider is
  'Payment provider identifier. New online payments use hitpay; historical and externally reconciled providers remain valid.';

comment on column public.payments.provider_payment_id is
  'Provider payment-request identifier used for checkout and webhook reconciliation.';

comment on column public.payments.provider_charge_id is
  'Provider charge/payment identifier used for refunds after a successful payment.';
