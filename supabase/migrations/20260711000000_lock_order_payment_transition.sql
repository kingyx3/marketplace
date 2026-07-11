-- Serialize Stripe order-payment transitions and bind each provider payment
-- reference to exactly one order before inventory is decremented.

create or replace function public.mark_order_paid(
  p_order_id uuid,
  p_provider_payment_id text,
  p_amount_cents integer,
  p_currency text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer_id uuid;
  v_status public.order_status;
  v_total_cents integer;
  v_currency text;
  v_existing_payment_id uuid;
  v_existing_order_id uuid;
  v_existing_preorder_id uuid;
  v_payment_id uuid;
begin
  if nullif(trim(p_provider_payment_id), '') is null then
    raise exception 'payment reference required' using errcode = '22023';
  end if;

  select customer_id, status, total_cents, upper(currency)
    into v_customer_id, v_status, v_total_cents, v_currency
  from public.orders
  where id = p_order_id
  for update;

  if v_customer_id is null then
    raise exception 'order not found' using errcode = 'P0002';
  end if;

  if v_status not in ('pending_payment', 'paid') then
    raise exception 'order not payable' using errcode = 'P0001';
  end if;

  if p_amount_cents is null or p_amount_cents <> v_total_cents then
    raise exception 'payment amount mismatch' using errcode = 'P0001';
  end if;

  if p_currency is null or upper(p_currency) <> v_currency then
    raise exception 'payment currency mismatch' using errcode = 'P0001';
  end if;

  select id, order_id, preorder_id
    into v_existing_payment_id, v_existing_order_id, v_existing_preorder_id
  from public.payments
  where provider = 'stripe'
    and provider_payment_id = trim(p_provider_payment_id)
  for update;

  if v_existing_payment_id is not null
     and (v_existing_order_id is distinct from p_order_id
          or v_existing_preorder_id is not null) then
    raise exception 'payment reference belongs to another record' using errcode = 'P0001';
  end if;

  if v_status = 'paid' then
    return;
  end if;

  update public.orders
     set status = 'paid'
   where id = p_order_id;

  update public.inventory i
     set allocated = greatest(0, i.allocated - oi.quantity),
         on_hand = greatest(0, i.on_hand - oi.quantity)
    from public.order_items oi
   where oi.order_id = p_order_id
     and oi.sku_id = i.sku_id
     and i.location = 'main';

  insert into public.payments (
    order_id,
    provider,
    provider_payment_id,
    kind,
    amount_cents,
    currency,
    status,
    captured_at
  )
  values (
    p_order_id,
    'stripe',
    trim(p_provider_payment_id),
    'full',
    p_amount_cents,
    upper(p_currency),
    'captured',
    now()
  )
  on conflict (provider, provider_payment_id) do update
    set amount_cents = excluded.amount_cents,
        currency = excluded.currency,
        status = 'captured',
        captured_at = coalesce(public.payments.captured_at, excluded.captured_at),
        updated_at = now()
    where public.payments.order_id = excluded.order_id
      and public.payments.preorder_id is null
  returning public.payments.id into v_payment_id;

  if v_payment_id is null then
    raise exception 'payment reference belongs to another record' using errcode = 'P0001';
  end if;
end;
$$;

revoke all on function public.mark_order_paid(uuid, text, integer, text)
  from public, anon, authenticated;
grant execute on function public.mark_order_paid(uuid, text, integer, text)
  to service_role;
