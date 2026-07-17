-- Remove the misleading account-wide billing flag and add audited delivery controls.
-- Order and preorder payments remain the source of truth for commercial state.

alter table public.customers
  drop column if exists billing_state;

create or replace function public.order_captured_payment_total(p_order_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(
    greatest(
      0,
      payment.amount_cents - coalesce((
        select sum(refund.amount_cents)::integer
        from public.refunds refund
        where refund.payment_id = payment.id
          and refund.status = 'succeeded'
      ), 0)
    )
  ), 0)::integer
  from public.payments payment
  where payment.status = 'captured'
    and upper(payment.currency) = (
      select upper(order_row.currency)
      from public.orders order_row
      where order_row.id = p_order_id
    )
    and (
      payment.order_id = p_order_id
      or payment.preorder_id in (
        select distinct item.preorder_id
        from public.order_items item
        where item.order_id = p_order_id
          and item.preorder_id is not null
      )
    );
$$;

revoke all on function public.order_captured_payment_total(uuid)
  from public, anon, authenticated;
grant execute on function public.order_captured_payment_total(uuid)
  to service_role;

create or replace function public.admin_mark_order_packing(
  p_order_id uuid,
  p_actor text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status public.order_status;
  v_total_cents integer;
  v_captured_cents integer;
begin
  if nullif(trim(p_actor), '') is null then
    raise exception 'admin actor required' using errcode = '22023';
  end if;

  select status, total_cents
    into v_status, v_total_cents
  from public.orders
  where id = p_order_id
  for update;

  if v_status is null then
    raise exception 'order not found' using errcode = 'P0002';
  end if;

  if v_status not in ('paid', 'packing') then
    raise exception 'order must be paid before packing' using errcode = 'P0001';
  end if;

  v_captured_cents := public.order_captured_payment_total(p_order_id);
  if v_captured_cents < v_total_cents then
    raise exception 'order payment incomplete' using errcode = 'P0001';
  end if;

  if v_status <> 'packing' then
    update public.orders
       set status = 'packing'
     where id = p_order_id;
  end if;

  insert into public.audit_logs (actor, table_name, record_id, action, old_data, new_data)
  values (
    trim(p_actor),
    'orders',
    p_order_id::text,
    'ADMIN_MARK_PACKING',
    jsonb_build_object('status', v_status),
    jsonb_build_object(
      'status', 'packing',
      'captured_cents', v_captured_cents,
      'total_cents', v_total_cents
    )
  );
end;
$$;

revoke all on function public.admin_mark_order_packing(uuid, text)
  from public, anon, authenticated;
grant execute on function public.admin_mark_order_packing(uuid, text)
  to service_role;

create or replace function public.admin_arrange_delivery(
  p_order_id uuid,
  p_carrier text,
  p_tracking_number text,
  p_address jsonb,
  p_actor text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status public.order_status;
  v_total_cents integer;
  v_captured_cents integer;
  v_address jsonb;
  v_shipment_id uuid;
  v_existing_status public.shipment_status;
begin
  if nullif(trim(p_actor), '') is null then
    raise exception 'admin actor required' using errcode = '22023';
  end if;

  if nullif(trim(p_carrier), '') is null then
    raise exception 'carrier required' using errcode = '22023';
  end if;

  select status, total_cents, shipping_address
    into v_status, v_total_cents, v_address
  from public.orders
  where id = p_order_id
  for update;

  if v_status is null then
    raise exception 'order not found' using errcode = 'P0002';
  end if;

  if v_status not in ('paid', 'packing', 'shipped') then
    raise exception 'order is not eligible for delivery arrangement' using errcode = 'P0001';
  end if;

  v_captured_cents := public.order_captured_payment_total(p_order_id);
  if v_captured_cents < v_total_cents then
    raise exception 'order payment incomplete' using errcode = 'P0001';
  end if;

  v_address := coalesce(p_address, v_address);
  if v_address is null or jsonb_typeof(v_address) <> 'object' then
    raise exception 'delivery address required' using errcode = '22023';
  end if;

  if trim(coalesce(v_address->>'recipientName', '')) = ''
     or trim(coalesce(v_address->>'line1', '')) = ''
     or trim(coalesce(v_address->>'postalCode', '')) = ''
     or upper(trim(coalesce(v_address->>'countryCode', ''))) !~ '^[A-Z]{2}$' then
    raise exception 'delivery address is incomplete' using errcode = '22023';
  end if;

  v_address := jsonb_set(
    v_address,
    '{countryCode}',
    to_jsonb(upper(trim(v_address->>'countryCode'))),
    true
  );

  select shipment.id, shipment.status
    into v_shipment_id, v_existing_status
  from public.shipments shipment
  where shipment.order_id = p_order_id
    and shipment.status in ('pending', 'label_created', 'in_transit', 'delivered')
  order by shipment.created_at desc
  limit 1
  for update;

  if v_existing_status in ('in_transit', 'delivered') then
    raise exception 'active shipment cannot be rearranged' using errcode = 'P0001';
  end if;

  if v_shipment_id is null then
    insert into public.shipments (
      order_id,
      carrier,
      tracking_number,
      status,
      address
    )
    values (
      p_order_id,
      trim(p_carrier),
      nullif(trim(p_tracking_number), ''),
      'label_created',
      v_address
    )
    returning id into v_shipment_id;
  else
    update public.shipments
       set carrier = trim(p_carrier),
           tracking_number = nullif(trim(p_tracking_number), ''),
           status = 'label_created',
           address = v_address,
           shipped_at = null,
           delivered_at = null
     where id = v_shipment_id;
  end if;

  update public.orders
     set status = 'packing',
         shipping_address = v_address,
         shipping_service = trim(p_carrier)
   where id = p_order_id;

  insert into public.audit_logs (actor, table_name, record_id, action, old_data, new_data)
  values (
    trim(p_actor),
    'shipments',
    v_shipment_id::text,
    'ADMIN_ARRANGE_DELIVERY',
    jsonb_build_object('order_status', v_status, 'shipment_status', v_existing_status),
    jsonb_build_object(
      'order_id', p_order_id,
      'order_status', 'packing',
      'shipment_status', 'label_created',
      'carrier', trim(p_carrier),
      'tracking_number', nullif(trim(p_tracking_number), '')
    )
  );

  return v_shipment_id;
end;
$$;

revoke all on function public.admin_arrange_delivery(uuid, text, text, jsonb, text)
  from public, anon, authenticated;
grant execute on function public.admin_arrange_delivery(uuid, text, text, jsonb, text)
  to service_role;

create or replace function public.admin_update_delivery_status(
  p_order_id uuid,
  p_shipment_id uuid,
  p_status text,
  p_actor text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_status public.order_status;
  v_previous_status public.shipment_status;
  v_next_status public.shipment_status;
  v_total_cents integer;
  v_captured_cents integer;
  v_next_order_status public.order_status;
begin
  if nullif(trim(p_actor), '') is null then
    raise exception 'admin actor required' using errcode = '22023';
  end if;

  if p_status not in ('pending', 'label_created', 'in_transit', 'delivered', 'returned', 'lost') then
    raise exception 'invalid delivery status' using errcode = '22023';
  end if;

  v_next_status := p_status::public.shipment_status;

  select shipment.status, order_row.status, order_row.total_cents
    into v_previous_status, v_order_status, v_total_cents
  from public.shipments shipment
  join public.orders order_row on order_row.id = shipment.order_id
  where shipment.id = p_shipment_id
    and shipment.order_id = p_order_id
  for update of shipment, order_row;

  if v_previous_status is null then
    raise exception 'shipment not found' using errcode = 'P0002';
  end if;

  if v_order_status not in ('paid', 'packing', 'shipped', 'delivered') then
    raise exception 'order is not eligible for delivery updates' using errcode = 'P0001';
  end if;

  v_captured_cents := public.order_captured_payment_total(p_order_id);
  if v_captured_cents < v_total_cents then
    raise exception 'order payment incomplete' using errcode = 'P0001';
  end if;

  v_next_order_status := case
    when v_next_status = 'delivered' then 'delivered'::public.order_status
    when v_next_status in ('in_transit', 'returned', 'lost') then 'shipped'::public.order_status
    else 'packing'::public.order_status
  end;

  update public.shipments
     set status = v_next_status,
         shipped_at = case
           when v_next_status in ('in_transit', 'delivered', 'returned', 'lost')
             then coalesce(shipped_at, now())
           else null
         end,
         delivered_at = case
           when v_next_status = 'delivered' then coalesce(delivered_at, now())
           else null
         end
   where id = p_shipment_id;

  update public.orders
     set status = v_next_order_status
   where id = p_order_id;

  insert into public.audit_logs (actor, table_name, record_id, action, old_data, new_data)
  values (
    trim(p_actor),
    'shipments',
    p_shipment_id::text,
    'ADMIN_UPDATE_DELIVERY_STATUS',
    jsonb_build_object(
      'order_status', v_order_status,
      'shipment_status', v_previous_status
    ),
    jsonb_build_object(
      'order_id', p_order_id,
      'order_status', v_next_order_status,
      'shipment_status', v_next_status
    )
  );
end;
$$;

revoke all on function public.admin_update_delivery_status(uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.admin_update_delivery_status(uuid, uuid, text, text)
  to service_role;

-- Preserve the existing API action while routing it through the stricter paid-order workflow.
create or replace function public.admin_ship_order(
  p_order_id uuid,
  p_carrier text,
  p_tracking_number text,
  p_actor text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shipment_id uuid;
begin
  v_shipment_id := public.admin_arrange_delivery(
    p_order_id,
    p_carrier,
    p_tracking_number,
    null,
    p_actor
  );

  perform public.admin_update_delivery_status(
    p_order_id,
    v_shipment_id,
    'in_transit',
    p_actor
  );
end;
$$;

revoke all on function public.admin_ship_order(uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.admin_ship_order(uuid, text, text, text)
  to service_role;
