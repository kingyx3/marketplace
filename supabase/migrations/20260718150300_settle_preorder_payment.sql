-- Settle full preorder payments under a row lock so cancellation/payment races
-- cannot leave a captured payment attached to a non-payable preorder.

create or replace function public.settle_preorder_payment(
  p_preorder_id uuid,
  p_provider_payment_id text,
  p_amount_cents integer,
  p_currency text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_preorder record;
  v_expected_amount integer;
begin
  select p.*
    into v_preorder
  from public.preorders p
  where p.id = p_preorder_id
  for update;

  if v_preorder.id is null then
    raise exception 'preorder not found' using errcode = 'P0002';
  end if;

  if v_preorder.status = 'paid' then
    return 'paid';
  end if;

  if v_preorder.status <> 'pending_payment' then
    return 'not_payable';
  end if;

  v_expected_amount := v_preorder.quantity * v_preorder.unit_price_cents;
  if p_amount_cents is null or p_amount_cents <> v_expected_amount then
    raise exception 'preorder payment amount mismatch' using errcode = 'P0001';
  end if;

  if p_currency is null or upper(p_currency) <> upper(v_preorder.currency) then
    raise exception 'preorder payment currency mismatch' using errcode = 'P0001';
  end if;

  update public.preorders
     set status = 'paid',
         deposit_cents = v_expected_amount,
         balance_cents = 0
   where id = p_preorder_id;

  insert into public.payments (
    preorder_id,
    provider,
    provider_payment_id,
    kind,
    amount_cents,
    currency,
    status,
    captured_at
  )
  values (
    p_preorder_id,
    'stripe',
    trim(p_provider_payment_id),
    'full',
    p_amount_cents,
    upper(p_currency),
    'captured',
    now()
  )
  on conflict (provider, provider_payment_id) do update
    set preorder_id = excluded.preorder_id,
        kind = 'full',
        amount_cents = excluded.amount_cents,
        currency = excluded.currency,
        status = 'captured',
        captured_at = coalesce(public.payments.captured_at, excluded.captured_at),
        updated_at = now();

  return 'paid';
end;
$$;

revoke all on function public.settle_preorder_payment(uuid, text, integer, text)
  from public, anon, authenticated;
grant execute on function public.settle_preorder_payment(uuid, text, integer, text)
  to service_role;
