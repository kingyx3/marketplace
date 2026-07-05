-- Service-role-only removal of assigned B2B pricing tiers.
-- Approved accounts without any assigned tier remain approved but cannot
-- use wholesale checkout until staff assigns a tier again.

create or replace function public.admin_remove_b2b_pricing_tier(
  p_customer_id uuid,
  p_pricing_tier_id uuid,
  p_actor text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account_id uuid;
  v_tier_code text;
begin
  if trim(coalesce(p_actor, '')) = '' then
    raise exception 'actor required' using errcode = '22023';
  end if;

  select id into v_account_id
  from public.b2b_accounts
  where customer_id = p_customer_id
    and approved = true
    and coalesce(review_status, 'approved') = 'approved';

  if v_account_id is null then
    raise exception 'approved b2b account not found' using errcode = 'P0002';
  end if;

  select code into v_tier_code
  from public.pricing_tiers
  where id = p_pricing_tier_id;

  if v_tier_code is null then
    raise exception 'pricing tier not found' using errcode = 'P0002';
  end if;

  delete from public.customer_pricing_tiers tier_assignment
  where tier_assignment.customer_id = p_customer_id
    and tier_assignment.pricing_tier_id = p_pricing_tier_id;

  if not found then
    raise exception 'pricing tier assignment not found' using errcode = 'P0002';
  end if;

  insert into public.audit_logs (actor, table_name, record_id, action, new_data)
  values (
    trim(p_actor),
    'customer_pricing_tiers',
    p_customer_id::text || ':' || p_pricing_tier_id::text,
    'REMOVE',
    jsonb_build_object(
      'customer_id', p_customer_id,
      'account_id', v_account_id,
      'pricing_tier_id', p_pricing_tier_id,
      'pricing_tier_code', v_tier_code
    )
  );
end;
$$;

revoke all on function public.admin_remove_b2b_pricing_tier(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.admin_remove_b2b_pricing_tier(uuid, uuid, text)
  to service_role;
