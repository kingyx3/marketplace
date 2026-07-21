-- Complete the HitPay migration without rewriting already-applied migration history.
-- Existing payment rows retain their recorded provider for auditability; active
-- checkout and settlement functions use HitPay for all new payment activity.

alter table public.customers
  drop column if exists stripe_customer_id;

do $migration$
declare
  v_signature text;
  v_function regprocedure;
  v_definition text;
begin
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

    v_definition := replace(v_definition, 'Stripe', 'HitPay');
    v_definition := replace(v_definition, 'stripe', 'hitpay');
    execute v_definition;
  end loop;
end
$migration$;
