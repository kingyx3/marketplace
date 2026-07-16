-- Reversible application-level account deletion.
-- Supabase Auth soft deletion is intentionally not used because it cannot be undone.

alter table public.customers
  add column if not exists deleted_at timestamptz,
  add column if not exists deletion_actor text,
  add column if not exists restored_at timestamptz,
  add column if not exists restoration_actor text;

create index if not exists customers_deleted_at_idx
  on public.customers (deleted_at)
  where deleted_at is not null;

comment on column public.customers.deleted_at is
  'When set, the storefront account is disabled while identity and commercial history are retained for a reversible restore.';
comment on column public.customers.deletion_actor is
  'Auditable actor that disabled the account, such as customer:<auth-user-id> or staff:<auth-user-id>.';
comment on column public.customers.restoration_actor is
  'Auditable staff actor that most recently restored the account.';

drop trigger if exists audit_log on public.customers;
create trigger audit_log after insert or update or delete on public.customers
  for each row execute function public.write_audit_log();

-- A deleted customer must lose direct Data API visibility even if an access token
-- remains valid until its normal JWT expiry.
drop policy if exists "own customer row select" on public.customers;
create policy "own customer row select" on public.customers
  for select to authenticated
  using ((select auth.uid()) = auth_user_id and deleted_at is null);

drop policy if exists "own customer row update" on public.customers;
create policy "own customer row update" on public.customers
  for update to authenticated
  using ((select auth.uid()) = auth_user_id and deleted_at is null)
  with check ((select auth.uid()) = auth_user_id and deleted_at is null);

drop policy if exists "own preorders" on public.preorders;
create policy "own preorders" on public.preorders
  for select to authenticated
  using (
    exists (
      select 1 from public.customers c
      where c.id = preorders.customer_id
        and c.auth_user_id = (select auth.uid())
        and c.deleted_at is null
    )
  );

drop policy if exists "own orders" on public.orders;
create policy "own orders" on public.orders
  for select to authenticated
  using (
    exists (
      select 1 from public.customers c
      where c.id = orders.customer_id
        and c.auth_user_id = (select auth.uid())
        and c.deleted_at is null
    )
  );

drop policy if exists "own order items" on public.order_items;
create policy "own order items" on public.order_items
  for select to authenticated
  using (
    exists (
      select 1
      from public.orders o
      join public.customers c on c.id = o.customer_id
      where o.id = order_items.order_id
        and c.auth_user_id = (select auth.uid())
        and c.deleted_at is null
    )
  );

drop policy if exists "own payments" on public.payments;
create policy "own payments" on public.payments
  for select to authenticated
  using (
    exists (
      select 1
      from public.orders o
      join public.customers c on c.id = o.customer_id
      where o.id = payments.order_id
        and c.auth_user_id = (select auth.uid())
        and c.deleted_at is null
    )
    or exists (
      select 1
      from public.preorders p
      join public.customers c on c.id = p.customer_id
      where p.id = payments.preorder_id
        and c.auth_user_id = (select auth.uid())
        and c.deleted_at is null
    )
  );

drop policy if exists "own shipments" on public.shipments;
create policy "own shipments" on public.shipments
  for select to authenticated
  using (
    exists (
      select 1
      from public.orders o
      join public.customers c on c.id = o.customer_id
      where o.id = shipments.order_id
        and c.auth_user_id = (select auth.uid())
        and c.deleted_at is null
    )
  );

drop policy if exists "own b2b account" on public.b2b_accounts;
create policy "own b2b account" on public.b2b_accounts
  for select to authenticated
  using (
    exists (
      select 1 from public.customers c
      where c.id = b2b_accounts.customer_id
        and c.auth_user_id = (select auth.uid())
        and c.deleted_at is null
    )
  );

drop policy if exists "own notifications" on public.notifications;
create policy "own notifications" on public.notifications
  for select to authenticated
  using (
    exists (
      select 1 from public.customers c
      where c.id = notifications.customer_id
        and c.auth_user_id = (select auth.uid())
        and c.deleted_at is null
    )
  );

drop policy if exists "own waitlist entries" on public.waitlist_entries;
create policy "own waitlist entries" on public.waitlist_entries
  for select to authenticated
  using (
    exists (
      select 1 from public.customers c
      where c.id = waitlist_entries.customer_id
        and c.auth_user_id = (select auth.uid())
        and c.deleted_at is null
    )
  );
