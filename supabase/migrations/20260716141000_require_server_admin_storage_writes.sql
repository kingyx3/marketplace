-- Admin authorization now includes a server-side email allowlist. Keep product
-- image mutations behind the same server gate instead of allowing active staff
-- accounts to write directly through the Data API.

revoke insert, update, delete on table storage.objects from authenticated;
revoke execute on function public.current_user_is_staff() from authenticated;

drop policy if exists "staff can upload product images" on storage.objects;
drop policy if exists "staff can update product images" on storage.objects;
drop policy if exists "staff can delete product images" on storage.objects;
