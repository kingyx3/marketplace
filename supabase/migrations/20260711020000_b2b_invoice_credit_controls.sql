-- Guard manual-invoice checkout with explicit operator policy, transactional
-- credit exposure checks, unique customer references, and expiring allocation.

alter table public.orders
  add column if not exists payment_method text,
  add column if not exists invoice_reference text,
  add column if not exists payment_due_at timestamptz,
  add column if not exists allocation_expires_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.orders'::regclass
      and conname = 'orders_payment_method_check'
  ) then
    alter table public.orders
      add constraint orders_payment_method_check
      check (payment_method is null or payment_method in ('stripe', 'manual_invoice'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.orders'::regclass
      and conname = 'orders_invoice_deadlines_check'
  ) then
    alter table public.orders
      add constraint orders_invoice_deadlines_check
      check (
        payment_method <> 'manual_invoice'
        or (
          invoice_reference is not null
          and payment_due_at is not null
          and allocation_expires_at is not null
          and allocation_expires_at <= payment_due_at
        )
      );
  end if;
end $$;

create unique index if not exists uq_orders_customer_invoice_reference
  on public.orders(customer_id, lower(invoice_reference))
  where invoice_reference is not null;

create index if not exists idx_orders_invoice_expiry
  on public.orders(allocation_expires_at)
  where payment_method = 'manual_invoice' and status = 'pending_payment';

insert into public.storefront_configurations ("key", label, description, value, active)
values (
  'b2b_invoice_policy',
  'B2B invoice credit policy',
  'Enable only after account credit limits and NET terms are reviewed. reservationHours controls how long stock remains allocated before automatic cancellation.',
  '{"enabled":false,"reservationHours":24,"maxPaymentTermDays":30,"requirePurchaseOrderReference":true}'::jsonb,
  false
)
on conflict ("key") do nothing;

create or replace function public.expire_stale_invoice_orders(p_limit integer default 100)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order record;
  v_count integer := 0;
begin
  if p_limit is null or p_limit < 1 or p_limit > 1000 then
    raise exception 'expiry limit must be between 1 and 1000' using errcode = '22023';
  end if;

  for v_order in
    select id, customer_id, allocation_expires_at
    from public.orders
    where payment_method = 'manual_invoice'
      and status = 'pending_payment'
      and allocation_expires_at <= now()
    order by allocation_expires_at asc
    for update skip locked
    limit p_limit
  loop
    perform public.release_order_allocation(v_order.id);

    update public.payments
       set status = 'cancelled'
     where order_id = v_order.id
       and provider = 'manual_invoice'
       and status in ('requires_capture', 'authorized');

    update public.orders
       set status = 'cancelled'
     where id = v_order.id
       and status = 'pending_payment';

    insert into public.audit_logs (actor, table_name, record_id, action, old_data, new_data)
    values (
      'system:invoice-expiry',
      'orders',
      v_order.id::text,
      'EXPIRE_B2B_INVOICE_ALLOCATION',
      jsonb_build_object(
        'status', 'pending_payment',
        'allocation_expires_at', v_order.allocation_expires_at
      ),
      jsonb_build_object('status', 'cancelled')
    );

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.expire_stale_invoice_orders(integer)
  from public, anon, authenticated;
grant execute on function public.expire_stale_invoice_orders(integer)
  to service_role;

create or replace function public.admin_set_b2b_credit_terms(
  p_account_id uuid,
  p_payment_terms text,
  p_credit_limit_cents integer,
  p_actor text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_days integer;
begin
  if nullif(trim(p_actor), '') is null then
    raise exception 'admin actor required' using errcode = '22023';
  end if;

  if upper(trim(coalesce(p_payment_terms, ''))) !~ '^NET([1-9]|[1-8][0-9]|90)$' then
    raise exception 'payment terms must be NET1 through NET90' using errcode = '22023';
  end if;
  v_days := substring(upper(trim(p_payment_terms)) from 4)::integer;

  if p_credit_limit_cents is null or p_credit_limit_cents < 1 then
    raise exception 'positive credit limit required' using errcode = '22023';
  end if;

  update public.b2b_accounts
     set payment_terms = 'NET' || v_days::text,
         credit_limit_cents = p_credit_limit_cents
   where id = p_account_id
     and approved
     and review_status = 'approved';

  if not found then
    raise exception 'approved b2b account not found' using errcode = 'P0002';
  end if;

  insert into public.audit_logs (actor, table_name, record_id, action, new_data)
  values (
    trim(p_actor),
    'b2b_accounts',
    p_account_id::text,
    'SET_B2B_CREDIT_TERMS',
    jsonb_build_object(
      'payment_terms', 'NET' || v_days::text,
      'credit_limit_cents', p_credit_limit_cents
    )
  );
end;
$$;

revoke all on function public.admin_set_b2b_credit_terms(uuid, text, integer, text)
  from public, anon, authenticated;
grant execute on function public.admin_set_b2b_credit_terms(uuid, text, integer, text)
  to service_role;

create or replace function public.create_b2b_invoice_order_from_cart(
  p_auth_user_id uuid,
  p_items jsonb,
  p_shipping_address jsonb,
  p_invoice_reference text,
  p_expected_subtotal_cents integer,
  p_discount_cents integer,
  p_discount_bps integer,
  p_expected_total_cents integer
)
returns table (
  order_id uuid,
  customer_id uuid,
  subtotal_cents integer,
  discount_cents integer,
  discount_bps integer,
  total_cents integer,
  currency text,
  payment_due_at timestamptz,
  allocation_expires_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer_id uuid;
  v_account record;
  v_policy jsonb;
  v_policy_active boolean;
  v_reservation_hours integer;
  v_max_term_days integer;
  v_term_days integer;
  v_reference text;
  v_exposure_cents bigint;
  v_created record;
  v_payment_due_at timestamptz;
  v_allocation_expires_at timestamptz;
begin
  perform public.expire_stale_invoice_orders(100);

  v_reference := trim(coalesce(p_invoice_reference, ''));
  if v_reference = '' or length(v_reference) > 120 then
    raise exception 'purchase order reference required' using errcode = '22023';
  end if;

  select c.id
    into v_customer_id
  from public.customers c
  where c.auth_user_id = p_auth_user_id;

  if v_customer_id is null then
    raise exception 'customer not found' using errcode = 'P0002';
  end if;

  select a.id, a.approved, a.review_status, a.payment_terms, a.credit_limit_cents
    into v_account
  from public.b2b_accounts a
  where a.customer_id = v_customer_id
  for update;

  if not found or not v_account.approved or v_account.review_status <> 'approved' then
    raise exception 'approved b2b account required' using errcode = 'P0001';
  end if;

  select value, active
    into v_policy, v_policy_active
  from public.storefront_configurations
  where "key" = 'b2b_invoice_policy';

  if not coalesce(v_policy_active, false)
     or v_policy is null
     or jsonb_typeof(v_policy) <> 'object'
     or lower(coalesce(v_policy->>'enabled', 'false')) <> 'true' then
    raise exception 'b2b invoice checkout is not configured' using errcode = 'P0001';
  end if;

  begin
    v_reservation_hours := (v_policy->>'reservationHours')::integer;
    v_max_term_days := (v_policy->>'maxPaymentTermDays')::integer;
  exception when others then
    raise exception 'b2b invoice policy is invalid' using errcode = '22023';
  end;

  if v_reservation_hours is null or v_reservation_hours < 1 or v_reservation_hours > 168
     or v_max_term_days is null or v_max_term_days < 1 or v_max_term_days > 90 then
    raise exception 'b2b invoice policy is invalid' using errcode = '22023';
  end if;

  if upper(trim(coalesce(v_account.payment_terms, ''))) !~ '^NET([1-9]|[1-8][0-9]|90)$' then
    raise exception 'account is not approved for invoice terms' using errcode = 'P0001';
  end if;
  v_term_days := substring(upper(trim(v_account.payment_terms)) from 4)::integer;

  if v_term_days > v_max_term_days then
    raise exception 'account payment terms exceed invoice policy' using errcode = 'P0001';
  end if;
  if v_account.credit_limit_cents is null or v_account.credit_limit_cents < 1 then
    raise exception 'account credit limit is not configured' using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.orders o
    where o.customer_id = v_customer_id
      and lower(o.invoice_reference) = lower(v_reference)
  ) then
    raise exception 'purchase order reference already used' using errcode = '23505';
  end if;

  select coalesce(sum(o.total_cents), 0)
    into v_exposure_cents
  from public.orders o
  where o.customer_id = v_customer_id
    and o.payment_method = 'manual_invoice'
    and o.status = 'pending_payment'
    and o.allocation_expires_at > now();

  if v_exposure_cents + p_expected_total_cents > v_account.credit_limit_cents then
    raise exception 'invoice credit limit exceeded' using errcode = 'P0001';
  end if;

  select *
    into v_created
  from public.create_checkout_order_from_cart(
    p_auth_user_id,
    p_items,
    'b2b'::public.sales_channel,
    p_shipping_address,
    p_expected_subtotal_cents,
    p_discount_cents,
    p_discount_bps,
    p_expected_total_cents
  );

  v_payment_due_at := now() + make_interval(days => v_term_days);
  v_allocation_expires_at := least(
    now() + make_interval(hours => v_reservation_hours),
    v_payment_due_at
  );

  update public.orders
     set payment_method = 'manual_invoice',
         invoice_reference = v_reference,
         payment_due_at = v_payment_due_at,
         allocation_expires_at = v_allocation_expires_at
   where id = v_created.order_id;

  insert into public.audit_logs (actor, table_name, record_id, action, new_data)
  values (
    'customer:' || v_customer_id::text,
    'orders',
    v_created.order_id::text,
    'CREATE_B2B_INVOICE_ORDER',
    jsonb_build_object(
      'invoice_reference', v_reference,
      'credit_limit_cents', v_account.credit_limit_cents,
      'prior_exposure_cents', v_exposure_cents,
      'order_total_cents', v_created.total_cents,
      'payment_due_at', v_payment_due_at,
      'allocation_expires_at', v_allocation_expires_at
    )
  );

  return query
  select v_created.order_id,
         v_created.customer_id,
         v_created.subtotal_cents,
         v_created.discount_cents,
         v_created.discount_bps,
         v_created.total_cents,
         v_created.currency,
         v_payment_due_at,
         v_allocation_expires_at;
end;
$$;

revoke all on function public.create_b2b_invoice_order_from_cart(
  uuid, jsonb, jsonb, text, integer, integer, integer, integer
) from public, anon, authenticated;
grant execute on function public.create_b2b_invoice_order_from_cart(
  uuid, jsonb, jsonb, text, integer, integer, integer, integer
) to service_role;
