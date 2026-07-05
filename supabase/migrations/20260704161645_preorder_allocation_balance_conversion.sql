-- Productize preorder allocation, balance collection, and conversion.
-- Application code computes allocation candidates with lib/allocation.ts;
-- these functions persist the state transitions transactionally.

create index if not exists idx_preorders_sku_status_created
  on public.preorders(sku_id, status, created_at);

create or replace function public.apply_preorder_allocations(
  p_sku_id uuid,
  p_allocations jsonb,
  p_actor text
)
returns table (
  preorder_id uuid,
  allocated_qty integer,
  balance_cents integer,
  status public.preorder_status
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item record;
  v_preorder record;
  v_delta integer;
  v_total_delta integer := 0;
  v_new_allocated integer;
  v_new_balance integer;
  v_captured_balance integer;
begin
  if p_sku_id is null then
    raise exception 'sku required' using errcode = '22023';
  end if;

  if nullif(trim(p_actor), '') is null then
    raise exception 'allocation actor required' using errcode = '22023';
  end if;

  if p_allocations is null or jsonb_typeof(p_allocations) <> 'array' then
    raise exception 'allocations must be an array' using errcode = '22023';
  end if;

  perform 1
  from public.inventory i
  where i.sku_id = p_sku_id
    and i.location = 'main'
  for update;

  if not found then
    raise exception 'inventory not found' using errcode = 'P0002';
  end if;

  for v_item in
    select candidate.preorder_id, candidate.allocated
    from jsonb_to_recordset(p_allocations) as candidate(preorder_id uuid, allocated integer)
  loop
    if v_item.preorder_id is null or v_item.allocated is null or v_item.allocated <= 0 then
      raise exception 'invalid allocation candidate' using errcode = '22023';
    end if;

    select id, quantity, allocated_qty, status
      into v_preorder
    from public.preorders
    where id = v_item.preorder_id
      and sku_id = p_sku_id
      and status in ('deposited', 'allocated', 'balance_due')
    for update;

    if v_preorder.id is null then
      raise exception 'preorder allocation target not found' using errcode = 'P0002';
    end if;

    v_delta := least(v_item.allocated, v_preorder.quantity - v_preorder.allocated_qty);
    if v_delta > 0 then
      v_total_delta := v_total_delta + v_delta;
    end if;
  end loop;

  if v_total_delta = 0 then
    return;
  end if;

  update public.inventory i
     set allocated = i.allocated + v_total_delta
   where i.sku_id = p_sku_id
     and i.location = 'main'
     and i.allocated + v_total_delta <= i.on_hand + i.incoming;

  if not found then
    raise exception 'insufficient allocation stock' using errcode = 'P0001';
  end if;

  for v_item in
    select candidate.preorder_id, candidate.allocated
    from jsonb_to_recordset(p_allocations) as candidate(preorder_id uuid, allocated integer)
  loop
    select p.id,
           p.quantity,
           p.allocated_qty,
           p.unit_price_cents,
           p.deposit_cents,
           p.status
      into v_preorder
    from public.preorders p
    where p.id = v_item.preorder_id
      and p.sku_id = p_sku_id
      and p.status in ('deposited', 'allocated', 'balance_due')
    for update;

    v_delta := least(v_item.allocated, v_preorder.quantity - v_preorder.allocated_qty);
    if v_delta <= 0 then
      continue;
    end if;

    select coalesce(sum(amount_cents), 0)::integer
      into v_captured_balance
    from public.payments
    where preorder_id = v_item.preorder_id
      and kind = 'balance'
      and status = 'captured';

    v_new_allocated := v_preorder.allocated_qty + v_delta;
    v_new_balance := greatest(
      0,
      (v_new_allocated * v_preorder.unit_price_cents)
        - v_preorder.deposit_cents
        - v_captured_balance
    );

    update public.preorders p
       set allocated_qty = v_new_allocated,
           balance_cents = v_new_balance,
           status = case
             when v_new_balance > 0 then 'balance_due'::public.preorder_status
             else 'allocated'::public.preorder_status
           end
     where p.id = v_item.preorder_id
    returning p.id, p.allocated_qty, p.balance_cents, p.status
      into preorder_id, allocated_qty, balance_cents, status;

    insert into public.audit_logs (actor, table_name, record_id, action, old_data, new_data)
    values (
      trim(p_actor),
      'preorders',
      v_item.preorder_id::text,
      'ADMIN_ALLOCATE_PREORDER',
      jsonb_build_object(
        'allocated_qty',
        v_preorder.allocated_qty,
        'status',
        v_preorder.status
      ),
      jsonb_build_object(
        'allocated_qty',
        allocated_qty,
        'balance_cents',
        balance_cents,
        'status',
        status
      )
    );

    return next;
  end loop;
end;
$$;

revoke all on function public.apply_preorder_allocations(uuid, jsonb, text)
  from public, anon, authenticated;
grant execute on function public.apply_preorder_allocations(uuid, jsonb, text)
  to service_role;

create or replace function public.mark_preorder_balance_paid(
  p_preorder_id uuid,
  p_provider_payment_id text,
  p_amount_cents integer,
  p_currency text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_preorder record;
  v_existing_payment_id uuid;
  v_existing_payment_preorder_id uuid;
  v_existing_payment_order_id uuid;
  v_order_id uuid;
  v_expected_order_total integer;
  v_captured_balance integer;
  v_remaining_due integer;
  v_payment_id uuid;
begin
  if nullif(trim(p_provider_payment_id), '') is null then
    raise exception 'payment reference required' using errcode = '22023';
  end if;

  select p.*
    into v_preorder
  from public.preorders p
  where p.id = p_preorder_id
  for update;

  if v_preorder.id is null then
    raise exception 'preorder not found' using errcode = 'P0002';
  end if;

  if v_preorder.order_id is not null and v_preorder.status = 'converted' then
    return v_preorder.order_id;
  end if;

  if v_preorder.status not in ('balance_due', 'paid') then
    raise exception 'preorder balance is not payable' using errcode = 'P0001';
  end if;

  if v_preorder.allocated_qty <= 0 then
    raise exception 'preorder has no allocation' using errcode = 'P0001';
  end if;

  if p_currency is null or upper(p_currency) <> upper(v_preorder.currency) then
    raise exception 'payment currency mismatch' using errcode = 'P0001';
  end if;

  select id, preorder_id, order_id
    into v_existing_payment_id, v_existing_payment_preorder_id, v_existing_payment_order_id
  from public.payments
  where provider = 'stripe'
    and provider_payment_id = trim(p_provider_payment_id)
  for update;

  if v_existing_payment_id is not null
     and (v_existing_payment_preorder_id is distinct from p_preorder_id
          or v_existing_payment_order_id is not null) then
    raise exception 'payment reference belongs to another record' using errcode = 'P0001';
  end if;

  select coalesce(sum(amount_cents), 0)::integer
    into v_captured_balance
  from public.payments
  where preorder_id = p_preorder_id
    and kind = 'balance'
    and status = 'captured'
    and provider_payment_id <> trim(p_provider_payment_id);

  v_expected_order_total := v_preorder.allocated_qty * v_preorder.unit_price_cents;
  v_remaining_due := greatest(0, v_expected_order_total - v_preorder.deposit_cents - v_captured_balance);

  if p_amount_cents is null
     or p_amount_cents <= 0
     or p_amount_cents <> v_preorder.balance_cents
     or p_amount_cents > v_remaining_due then
    raise exception 'payment amount exceeds remaining balance' using errcode = 'P0001';
  end if;

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
    'balance',
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
    where public.payments.preorder_id = excluded.preorder_id
      and public.payments.order_id is null
  returning public.payments.id into v_payment_id;

  if v_payment_id is null then
    raise exception 'payment reference belongs to another record' using errcode = 'P0001';
  end if;

  insert into public.orders (
    customer_id,
    channel,
    status,
    currency,
    subtotal_cents,
    discount_cents,
    discount_bps,
    shipping_cents,
    tax_cents,
    total_cents,
    placed_at
  )
  values (
    v_preorder.customer_id,
    v_preorder.channel,
    'paid',
    upper(v_preorder.currency),
    v_expected_order_total,
    0,
    0,
    0,
    round(v_expected_order_total * 9.0 / 109.0)::integer,
    v_expected_order_total,
    now()
  )
  returning id into v_order_id;

  insert into public.order_items (
    order_id,
    sku_id,
    preorder_id,
    quantity,
    unit_price_cents
  )
  values (
    v_order_id,
    v_preorder.sku_id,
    p_preorder_id,
    v_preorder.allocated_qty,
    v_preorder.unit_price_cents
  );

  update public.preorders
     set status = 'converted',
         balance_cents = 0,
         order_id = v_order_id
   where id = p_preorder_id;

  insert into public.audit_logs (actor, table_name, record_id, action, old_data, new_data)
  values (
    'stripe:webhook',
    'preorders',
    p_preorder_id::text,
    'PREORDER_BALANCE_PAID_CONVERTED',
    jsonb_build_object(
      'status',
      v_preorder.status,
      'balance_cents',
      v_preorder.balance_cents
    ),
    jsonb_build_object(
      'status',
      'converted',
      'order_id',
      v_order_id,
      'provider_payment_id',
      trim(p_provider_payment_id)
    )
  );

  return v_order_id;
end;
$$;

revoke all on function public.mark_preorder_balance_paid(uuid, text, integer, text)
  from public, anon, authenticated;
grant execute on function public.mark_preorder_balance_paid(uuid, text, integer, text)
  to service_role;
