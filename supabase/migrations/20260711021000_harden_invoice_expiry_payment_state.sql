-- Include the application-level pending state when expiring manual invoices.

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
       and status in ('pending', 'requires_capture', 'authorized');

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
