-- Allocate only fully paid preorders and require Stripe refund confirmation for shortfalls.

drop function if exists public.apply_preorder_allocations(uuid, jsonb, text);
drop function if exists public.mark_preorder_balance_paid(uuid, text, integer, text);

create or replace function public.stage_preorder_allocations(
  p_sku_id uuid,
  p_allocations jsonb,
  p_fingerprint text,
  p_actor text
)
returns table (
  preorder_id uuid,
  allocated_qty integer,
  refund_cents integer,
  payment_id uuid,
  provider_payment_id text,
  currency text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inventory record;
  v_candidate record;
  v_preorder record;
  v_payment record;
  v_available integer;
  v_total_allocated integer := 0;
  v_expected_count integer;
  v_candidate_count integer;
  v_distinct_count integer;
begin
  if p_sku_id is null then
    raise exception 'sku required' using errcode = '22023';
  end if;
  if nullif(trim(p_actor), '') is null then
    raise exception 'allocation actor required' using errcode = '22023';
  end if;
  if nullif(trim(p_fingerprint), '') is null then
    raise exception 'allocation fingerprint required' using errcode = '22023';
  end if;
  if p_allocations is null or jsonb_typeof(p_allocations) <> 'array' then
    raise exception 'allocations must be an array' using errcode = '22023';
  end if;

  select i.*
    into v_inventory
  from public.inventory i
  where i.sku_id = p_sku_id
    and i.location = 'main'
  for update;

  if v_inventory.id is null then
    raise exception 'inventory not found' using errcode = 'P0002';
  end if;

  perform 1
  from public.preorders p
  where p.sku_id = p_sku_id
    and p.channel = 'b2c'
    and p.status = 'paid'
  order by p.created_at, p.id
  for update;

  select count(*)::integer
    into v_expected_count
  from public.preorders p
  where p.sku_id = p_sku_id
    and p.channel = 'b2c'
    and p.status = 'paid';

  select count(*)::integer, count(distinct candidate.preorder_id)::integer
    into v_candidate_count, v_distinct_count
  from jsonb_to_recordset(p_allocations)
    as candidate(preorder_id uuid, allocated integer);

  if v_expected_count = 0 then
    return;
  end if;
  if v_candidate_count <> v_expected_count or v_distinct_count <> v_expected_count then
    raise exception 'allocation preview is stale; refresh and confirm again' using errcode = 'P0001';
  end if;

  v_available := greatest(
    0,
    v_inventory.on_hand + v_inventory.incoming - v_inventory.allocated - v_inventory.safety_stock
  );

  for v_candidate in
    select candidate.preorder_id, candidate.allocated
    from jsonb_to_recordset(p_allocations)
      as candidate(preorder_id uuid, allocated integer)
  loop
    select p.*
      into v_preorder
    from public.preorders p
    where p.id = v_candidate.preorder_id
      and p.sku_id = p_sku_id
      and p.channel = 'b2c'
      and p.status = 'paid'
    for update;

    if v_preorder.id is null then
      raise exception 'allocation preview is stale; refresh and confirm again' using errcode = 'P0001';
    end if;
    if v_candidate.allocated is null
       or v_candidate.allocated < 0
       or v_candidate.allocated > v_preorder.quantity then
      raise exception 'invalid preorder allocation' using errcode = '22023';
    end if;

    select pay.*
      into v_payment
    from public.payments pay
    where pay.preorder_id = v_preorder.id
      and pay.kind = 'full'
      and pay.status = 'captured'
    order by pay.captured_at desc nulls last, pay.created_at desc
    limit 1
    for update;

    if v_payment.id is null
       or v_payment.amount_cents <> v_preorder.quantity * v_preorder.unit_price_cents
       or upper(v_payment.currency) <> upper(v_preorder.currency) then
      raise exception 'preorder does not have a matching full payment' using errcode = 'P0001';
    end if;

    v_total_allocated := v_total_allocated + v_candidate.allocated;
  end loop;

  if v_total_allocated > v_available then
    raise exception 'allocation stock changed; refresh and confirm again' using errcode = 'P0001';
  end if;

  update public.inventory
     set allocated = allocated + v_total_allocated
   where id = v_inventory.id;

  for v_candidate in
    select candidate.preorder_id, candidate.allocated
    from jsonb_to_recordset(p_allocations)
      as candidate(preorder_id uuid, allocated integer)
  loop
    update public.preorders p
       set allocated_qty = v_candidate.allocated,
           allocation_refund_cents = (p.quantity - v_candidate.allocated) * p.unit_price_cents,
           allocation_confirmed_at = now(),
           allocation_actor = trim(p_actor),
           allocation_fingerprint = trim(p_fingerprint),
           status = case
             when v_candidate.allocated < p.quantity then 'refund_pending'::public.preorder_status
             else 'allocated'::public.preorder_status
           end
     where p.id = v_candidate.preorder_id;

    insert into public.audit_logs (actor, table_name, record_id, action, new_data)
    select
      trim(p_actor),
      'preorders',
      p.id::text,
      'ADMIN_STAGE_PREORDER_ALLOCATION',
      jsonb_build_object(
        'allocated_qty', p.allocated_qty,
        'refund_cents', p.allocation_refund_cents,
        'fingerprint', p.allocation_fingerprint
      )
    from public.preorders p
    where p.id = v_candidate.preorder_id;
  end loop;

  return query
  select
    p.id,
    p.allocated_qty,
    p.allocation_refund_cents,
    pay.id,
    pay.provider_payment_id,
    p.currency
  from public.preorders p
  join lateral (
    select payment.id, payment.provider_payment_id
    from public.payments payment
    where payment.preorder_id = p.id
      and payment.kind = 'full'
      and payment.status = 'captured'
    order by payment.captured_at desc nulls last, payment.created_at desc
    limit 1
  ) pay on true
  where p.sku_id = p_sku_id
    and p.allocation_fingerprint = trim(p_fingerprint)
    and p.status in ('allocated', 'refund_pending')
  order by p.created_at, p.id;
end;
$$;

revoke all on function public.stage_preorder_allocations(uuid, jsonb, text, text)
  from public, anon, authenticated;
grant execute on function public.stage_preorder_allocations(uuid, jsonb, text, text)
  to service_role;

create or replace function public.finalize_preorder_allocation(
  p_preorder_id uuid,
  p_provider_refund_id text,
  p_refund_status text,
  p_actor text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_preorder record;
  v_payment record;
  v_order_id uuid;
  v_order_total integer;
  v_refund_status public.refund_status;
begin
  if nullif(trim(p_actor), '') is null then
    raise exception 'allocation actor required' using errcode = '22023';
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
  if v_preorder.status = 'refunded' and v_preorder.allocated_qty = 0 then
    return null;
  end if;
  if v_preorder.status not in ('allocated', 'refund_pending') then
    raise exception 'preorder allocation is not staged' using errcode = 'P0001';
  end if;

  select pay.*
    into v_payment
  from public.payments pay
  where pay.preorder_id = p_preorder_id
    and pay.kind = 'full'
    and pay.status = 'captured'
  order by pay.captured_at desc nulls last, pay.created_at desc
  limit 1
  for update;

  if v_payment.id is null then
    raise exception 'captured preorder payment not found' using errcode = 'P0002';
  end if;

  if v_preorder.allocation_refund_cents > 0 then
    if nullif(trim(p_provider_refund_id), '') is null then
      raise exception 'Stripe refund confirmation required' using errcode = '22023';
    end if;

    v_refund_status := case lower(trim(coalesce(p_refund_status, 'pending')))
      when 'succeeded' then 'succeeded'::public.refund_status
      when 'failed' then 'failed'::public.refund_status
      else 'pending'::public.refund_status
    end;

    insert into public.refunds (
      payment_id,
      provider_refund_id,
      amount_cents,
      currency,
      reason,
      status
    )
    values (
      v_payment.id,
      trim(p_provider_refund_id),
      v_preorder.allocation_refund_cents,
      upper(v_preorder.currency),
      'preorder_allocation_shortfall',
      v_refund_status
    )
    on conflict (provider_refund_id) where provider_refund_id is not null do update
      set amount_cents = excluded.amount_cents,
          currency = excluded.currency,
          reason = excluded.reason,
          status = excluded.status,
          updated_at = now();
  elsif nullif(trim(coalesce(p_provider_refund_id, '')), '') is not null then
    raise exception 'refund is not required for a full allocation' using errcode = '22023';
  end if;

  if v_preorder.allocated_qty > 0 then
    v_order_total := v_preorder.allocated_qty * v_preorder.unit_price_cents;

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
      v_order_total,
      0,
      0,
      0,
      round(v_order_total * 9.0 / 109.0)::integer,
      v_order_total,
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
           order_id = v_order_id,
           balance_cents = 0
     where id = p_preorder_id;
  else
    update public.preorders
       set status = 'refunded',
           balance_cents = 0
     where id = p_preorder_id;
  end if;

  insert into public.audit_logs (actor, table_name, record_id, action, new_data)
  values (
    trim(p_actor),
    'preorders',
    p_preorder_id::text,
    'ADMIN_FINALIZE_PREORDER_ALLOCATION',
    jsonb_build_object(
      'allocated_qty', v_preorder.allocated_qty,
      'refund_cents', v_preorder.allocation_refund_cents,
      'provider_refund_id', nullif(trim(coalesce(p_provider_refund_id, '')), ''),
      'order_id', v_order_id
    )
  );

  return v_order_id;
end;
$$;

revoke all on function public.finalize_preorder_allocation(uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.finalize_preorder_allocation(uuid, text, text, text)
  to service_role;
