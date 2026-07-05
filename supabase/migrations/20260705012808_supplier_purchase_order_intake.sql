-- Service-role-only supplier purchase-order intake.
-- Records a confirmed supplier PO and atomically raises confirmed incoming stock.

drop trigger if exists audit_log on public.purchase_orders;
create trigger audit_log
after insert or update or delete on public.purchase_orders
for each row execute function public.write_audit_log();

drop trigger if exists audit_log on public.purchase_order_items;
create trigger audit_log
after insert or update or delete on public.purchase_order_items
for each row execute function public.write_audit_log();

create or replace function public.admin_create_supplier_purchase_order(
  p_supplier_id uuid,
  p_sku_id uuid,
  p_quantity integer,
  p_unit_cost_cents integer,
  p_currency text,
  p_expected_at date,
  p_notes text,
  p_actor text
)
returns table (
  purchase_order_id uuid,
  purchase_order_item_id uuid,
  incoming integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_currency text := upper(trim(coalesce(p_currency, '')));
  v_total bigint;
  v_purchase_order_id uuid;
  v_purchase_order_item_id uuid;
  v_incoming integer;
begin
  if trim(coalesce(p_actor, '')) = '' then
    raise exception 'actor required' using errcode = '22023';
  end if;

  if p_quantity is null or p_quantity <= 0 then
    raise exception 'quantity must be positive' using errcode = '22023';
  end if;

  if p_unit_cost_cents is null or p_unit_cost_cents < 0 then
    raise exception 'unit cost must be non-negative' using errcode = '22023';
  end if;

  if v_currency !~ '^[A-Z]{3}$' then
    raise exception 'currency must be ISO-4217 style code' using errcode = '22023';
  end if;

  v_total := p_quantity::bigint * p_unit_cost_cents::bigint;
  if v_total > 2147483647 then
    raise exception 'purchase order total exceeds supported integer range' using errcode = '22003';
  end if;

  perform 1 from public.suppliers where id = p_supplier_id;
  if not found then
    raise exception 'supplier not found' using errcode = 'P0002';
  end if;

  perform 1 from public.booster_box_skus where id = p_sku_id;
  if not found then
    raise exception 'sku not found' using errcode = 'P0002';
  end if;

  insert into public.purchase_orders (
    supplier_id,
    status,
    currency,
    placed_at,
    expected_at,
    total_cents,
    notes
  )
  values (
    p_supplier_id,
    'confirmed',
    v_currency,
    now(),
    p_expected_at,
    v_total::integer,
    nullif(trim(coalesce(p_notes, '')), '')
  )
  returning id into v_purchase_order_id;

  insert into public.purchase_order_items (
    purchase_order_id,
    sku_id,
    quantity,
    unit_cost_cents
  )
  values (
    v_purchase_order_id,
    p_sku_id,
    p_quantity,
    p_unit_cost_cents
  )
  returning id into v_purchase_order_item_id;

  insert into public.inventory as inventory_row (
    sku_id,
    location,
    incoming
  )
  values (
    p_sku_id,
    'main',
    p_quantity
  )
  on conflict (sku_id, location) do update
    set incoming = inventory_row.incoming + excluded.incoming,
        updated_at = now()
  returning inventory_row.incoming into v_incoming;

  insert into public.audit_logs (actor, table_name, record_id, action, new_data)
  values (
    trim(p_actor),
    'purchase_orders',
    v_purchase_order_id::text,
    'ADMIN_SUPPLIER_PO_INTAKE',
    jsonb_build_object(
      'purchase_order_id', v_purchase_order_id,
      'purchase_order_item_id', v_purchase_order_item_id,
      'supplier_id', p_supplier_id,
      'sku_id', p_sku_id,
      'quantity', p_quantity,
      'unit_cost_cents', p_unit_cost_cents,
      'currency', v_currency,
      'total_cents', v_total::integer,
      'expected_at', p_expected_at,
      'incoming_after', v_incoming
    )
  );

  return query
    select v_purchase_order_id, v_purchase_order_item_id, v_incoming;
end;
$$;

revoke all on function public.admin_create_supplier_purchase_order(
  uuid,
  uuid,
  integer,
  integer,
  text,
  date,
  text,
  text
) from public, anon, authenticated;
grant execute on function public.admin_create_supplier_purchase_order(
  uuid,
  uuid,
  integer,
  integer,
  text,
  date,
  text,
  text
) to service_role;
