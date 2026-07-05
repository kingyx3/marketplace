-- Make wholesale review outcomes durable instead of overloading the
-- approved boolean. Existing approved rows are promoted to approved
-- review status; existing unapproved rows remain pending.

alter table public.b2b_accounts
  add column if not exists review_status text not null default 'pending',
  add column if not exists reviewed_at timestamptz,
  add column if not exists review_note text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.b2b_accounts'::regclass
      and conname = 'b2b_accounts_review_status_check'
  ) then
    alter table public.b2b_accounts
      add constraint b2b_accounts_review_status_check
      check (review_status in ('pending', 'approved', 'rejected'));
  end if;
end $$;

update public.b2b_accounts
set
  review_status = 'approved',
  reviewed_at = coalesce(reviewed_at, approved_at, updated_at, now())
where approved
  and review_status <> 'approved';

update public.b2b_accounts
set
  approved = false,
  approved_at = null
where review_status in ('pending', 'rejected')
  and approved;

create or replace function public.admin_review_b2b_account(
  p_account_id uuid,
  p_decision text,
  p_pricing_tier_id uuid default null,
  p_review_note text default null,
  p_actor text default 'service'
)
returns table (
  account_id uuid,
  customer_id uuid,
  review_status text,
  pricing_tier_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account record;
  v_tier record;
begin
  select account.id, account.customer_id
    into v_account
  from public.b2b_accounts account
  where account.id = p_account_id
  for update;

  if not found then
    raise exception 'b2b account not found' using errcode = 'P0002';
  end if;

  if p_decision = 'approved' then
    if p_pricing_tier_id is null then
      raise exception 'pricing tier required' using errcode = '22023';
    end if;

    select id, code, name, discount_bps, min_order_cents
      into v_tier
    from public.pricing_tiers
    where id = p_pricing_tier_id;

    if not found then
      raise exception 'pricing tier not found' using errcode = 'P0002';
    end if;

    delete from public.customer_pricing_tiers tier_assignment
    where tier_assignment.customer_id = v_account.customer_id;

    insert into public.customer_pricing_tiers (customer_id, pricing_tier_id)
    values (v_account.customer_id, p_pricing_tier_id);

    update public.b2b_accounts
    set
      approved = true,
      approved_at = coalesce(approved_at, now()),
      review_status = 'approved',
      reviewed_at = now(),
      review_note = null
    where id = p_account_id;

    insert into public.audit_logs (actor, table_name, record_id, action, new_data)
    values (
      p_actor,
      'customer_pricing_tiers',
      v_account.customer_id::text || ':' || p_pricing_tier_id::text,
      'ASSIGN',
      jsonb_build_object(
        'customer_id', v_account.customer_id,
        'pricing_tier_id', p_pricing_tier_id,
        'pricing_tier_code', v_tier.code
      )
    );

    return query select p_account_id, v_account.customer_id, 'approved'::text, p_pricing_tier_id;
    return;
  end if;

  if p_decision = 'rejected' then
    delete from public.customer_pricing_tiers tier_assignment
    where tier_assignment.customer_id = v_account.customer_id;

    update public.b2b_accounts
    set
      approved = false,
      approved_at = null,
      review_status = 'rejected',
      reviewed_at = now(),
      review_note = nullif(trim(coalesce(p_review_note, '')), '')
    where id = p_account_id;

    insert into public.audit_logs (actor, table_name, record_id, action, new_data)
    values (
      p_actor,
      'b2b_accounts',
      p_account_id::text,
      'REJECT',
      jsonb_build_object(
        'account_id', p_account_id,
        'customer_id', v_account.customer_id,
        'review_note', nullif(trim(coalesce(p_review_note, '')), '')
      )
    );

    return query select p_account_id, v_account.customer_id, 'rejected'::text, null::uuid;
    return;
  end if;

  raise exception 'invalid b2b review decision' using errcode = '22023';
end;
$$;

revoke all on function public.admin_review_b2b_account(uuid, text, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.admin_review_b2b_account(uuid, text, uuid, text, text)
  to service_role;
