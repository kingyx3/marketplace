do $test$
declare
  v_signature text;
  v_function regprocedure;
  v_definition text;
  v_provider_default text;
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'customers'
      and column_name = 'stripe_customer_id'
  ) then
    raise exception 'legacy stripe_customer_id column is still present';
  end if;

  foreach v_signature in array array[
    'public.expire_checkout_reservations(integer)',
    'public.settle_order_payment(uuid,text,integer,text)',
    'public.settle_preorder_payment(uuid,text,integer,text)',
    'public.finalize_preorder_allocation(uuid,text,text,text)'
  ]::text[]
  loop
    v_function := to_regprocedure(v_signature);
    if v_function is null then
      raise exception 'required payment function not found: %', v_signature;
    end if;

    select pg_get_functiondef(v_function)
      into v_definition;

    if position('stripe' in lower(v_definition)) > 0 then
      raise exception 'active payment function still references Stripe: %', v_signature;
    end if;
  end loop;

  select pg_get_expr(d.adbin, d.adrelid)
    into v_provider_default
  from pg_attribute a
  join pg_attrdef d
    on d.adrelid = a.attrelid
   and d.adnum = a.attnum
  where a.attrelid = 'public.payments'::regclass
    and a.attname = 'provider'
    and not a.attisdropped;

  if v_provider_default is null or position('hitpay' in lower(v_provider_default)) = 0 then
    raise exception 'payments.provider does not default to HitPay';
  end if;
end
$test$;
