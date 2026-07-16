-- Keep delegated administrator identity and staff state synchronized even when
-- grants are updated outside the normal application RPC.

create or replace function public.prevent_accepted_admin_grant_email_change()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.auth_user_id is not null and new.email is distinct from old.email then
    raise exception 'accepted administrator email cannot be changed; revoke it and create a new grant'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_accepted_admin_grant_email_change on public.admin_access_grants;
create trigger prevent_accepted_admin_grant_email_change
  before update of email on public.admin_access_grants
  for each row execute function public.prevent_accepted_admin_grant_email_change();

create or replace function public.synchronize_admin_grant_staff()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.auth_user_id is not null then
    update public.staff_users
       set email = new.email,
           role = case when source = 'environment' then 'owner' else new.role end,
           active = case when source = 'environment' then true else new.active end,
           created_by_staff_id = coalesce(created_by_staff_id, new.created_by_staff_id)
     where auth_user_id = new.auth_user_id;
  end if;

  return new;
end;
$$;

revoke all on function public.prevent_accepted_admin_grant_email_change() from public, anon, authenticated;
revoke all on function public.synchronize_admin_grant_staff() from public, anon, authenticated;

drop trigger if exists synchronize_admin_grant_staff on public.admin_access_grants;
create trigger synchronize_admin_grant_staff
  after insert or update of role, active, auth_user_id on public.admin_access_grants
  for each row execute function public.synchronize_admin_grant_staff();
