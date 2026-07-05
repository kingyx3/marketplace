-- Product image storage configuration.
-- Supabase manages the `storage` schema; this migration declares the
-- durable bucket and object policies so product media setup is not a
-- dashboard-only step.

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'product-images',
  'product-images',
  true,
  5242880,
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif']
)
on conflict (id) do update
set
  name = excluded.name,
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.current_user_is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.staff_users staff
    where staff.auth_user_id = (select auth.uid())
      and staff.active
  );
$$;

revoke all on function public.current_user_is_staff() from public, anon, authenticated;
grant execute on function public.current_user_is_staff() to authenticated, service_role;

grant select on table storage.buckets to anon, authenticated, service_role;
grant select on table storage.objects to anon, authenticated, service_role;
grant insert, update, delete on table storage.objects to authenticated, service_role;

drop policy if exists "product images are publicly readable" on storage.objects;
create policy "product images are publicly readable"
  on storage.objects
  for select
  to anon, authenticated
  using (bucket_id = 'product-images');

drop policy if exists "staff can upload product images" on storage.objects;
create policy "staff can upload product images"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'product-images'
    and (select public.current_user_is_staff())
  );

drop policy if exists "staff can update product images" on storage.objects;
create policy "staff can update product images"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'product-images'
    and (select public.current_user_is_staff())
  )
  with check (
    bucket_id = 'product-images'
    and (select public.current_user_is_staff())
  );

drop policy if exists "staff can delete product images" on storage.objects;
create policy "staff can delete product images"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'product-images'
    and (select public.current_user_is_staff())
  );
